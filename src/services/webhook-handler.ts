import logger from '../config/logger';
import axios from 'axios';
import { getDbClient } from '../config/database';

// Types for WhatsApp webhook payload
interface WhatsAppWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: {
    body: string;
  };
  image?: {
    caption?: string;
    id: string;
  };
  audio?: {
    id: string;
  };
  video?: {
    caption?: string;
    id: string;
  };
  document?: {
    filename: string;
    id: string;
  };
  location?: {
    latitude: number;
    longitude: number;
  };
  button?: {
    text: string;
    payload: string;
  };
  interactive?: {
    type: string;
    button_reply?: {
      title: string;
    };
    list_reply?: {
      title: string;
    };
  };
  [key: string]: any;
}

interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      metadata: {
        phone_number_id: string;
        display_phone_number: string;
      };
      contacts?: Array<{
        profile: {
          name: string;
        };
        wa_id: string;
      }>;
      messages?: WhatsAppWebhookMessage[];
      statuses?: Array<{
        id: string;
        status: string;
        timestamp: string;
        recipient_id: string;
        errors?: Array<{
          code: number;
          title: string;
        }>;
      }>;
    };
    field: string;
  }>;
}

interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppWebhookEntry[];
}

/**
 * Handle webhook verification (GET request)
 * Supports multiple clients by checking verify token in database
 */
export async function handleWebhookVerify(
  verifyToken: string,
  challenge: string
): Promise<string> {
  const pool = await getDbClient();
  
  if (!pool) {
    // Fallback to environment variable if database not available
    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.WEBHOOK_VERIFY_TOKEN;
    
    if (!expectedToken) {
      logger.warn('No verify token configured');
      throw new Error('Verify token not configured');
    }
    
    if (verifyToken !== expectedToken) {
      logger.warn('Verify token mismatch');
      throw new Error('Invalid verify token');
    }
    
    logger.info('Webhook verification successful (using env token)');
    return challenge;
  }

  try {
    // Query database for account with matching verify token
    // This allows multiple clients with different verify tokens
    const result = await pool.query(
      `SELECT id, chatbot_id, phone_number_id FROM whatsapp_accounts 
       WHERE verify_token = $1 AND status = 'active' LIMIT 1`,
      [verifyToken]
    );

    if (result.rows.length === 0) {
      logger.warn(`No active account found with verify token: ${verifyToken}`);
      throw new Error('Invalid verify token');
    }

    const account = result.rows[0];
    logger.info(`Webhook verification successful for account ID: ${account.id}, chatbot: ${account.chatbot_id}`);
    return challenge;
  } catch (error: any) {
    logger.error('Error verifying webhook:', error);
    throw error;
  }
}

/**
 * Handle incoming webhook messages (POST request)
 * Processes messages for all clients/users based on phone number ID
 */
export async function handleWebhookMessage(payload: WhatsAppWebhookPayload): Promise<void> {
  const pool = await getDbClient();
  
  // Fallback to environment variables if no database connection
  if (!pool) {
    logger.warn('Database connection not available - using single-user mode with env variables');
    
    // Log the complete webhook payload from Meta
    logger.info('📥 Complete WhatsApp Webhook Payload from Meta:', {
      payload: JSON.stringify(payload, null, 2)
    });
    
    const account = {
      id: 'env-account',
      chatbot_id: process.env.CHATBOT_ID || 'test-chatbot',
      phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID,
      access_token: process.env.WHATSAPP_ACCESS_TOKEN,
      waba_id: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      display_phone_number: process.env.WHATSAPP_DISPLAY_PHONE_NUMBER || 'Unknown'
    };

    try {
      for (const entry of payload.entry) {
        logger.info('📨 Entry Details:', {
          businessAccountId: entry.id,
          changesCount: entry.changes.length
        });
        
        for (const change of entry.changes) {
          const { field, value } = change;
          
          logger.info('🔄 Change Details:', {
            field: field,
            metadata: value?.metadata,
            hasMessages: !!value?.messages,
            hasStatuses: !!value?.statuses,
            messagesCount: value?.messages?.length || 0,
            statusesCount: value?.statuses?.length || 0
          });
          
          if (field === 'messages') {
            const messages = value?.messages;
            if (messages && messages.length > 0) {
              for (const message of messages) {
                await processIncomingMessageSimple(account, message, value?.contacts);
              }
            }
          } else {
            logger.info(`Webhook field received: ${field}`);
          }
        }
      }
    } catch (error) {
      logger.error('Error processing webhook message:', error);
      throw error;
    }
    return;
  }

  try {
    for (const entry of payload.entry) {
      const businessAccountId = entry.id;

      for (const change of entry.changes) {
        const { field, value } = change;
        const phoneNumberId = value?.metadata?.phone_number_id;

        if (!phoneNumberId) {
          logger.warn('No phone number ID in webhook payload');
          continue;
        }

        logger.info(`Processing webhook for phone number ID: ${phoneNumberId}`);

        // Find account(s) by phone number ID - supports multiple clients
        const accountResult = await pool.query(
          `SELECT id, chatbot_id, phone_number_id, access_token, waba_id, display_phone_number 
           FROM whatsapp_accounts 
           WHERE phone_number_id = $1 AND status = 'active'`,
          [phoneNumberId]
        );

        if (accountResult.rows.length === 0) {
          logger.warn(`No active account found for phone number ID: ${phoneNumberId}`);
          continue;
        }

        // Process each account (in case multiple chatbots use same phone number)
        for (const account of accountResult.rows) {
          logger.info(`Processing for account ID: ${account.id}, chatbot: ${account.chatbot_id}`);

          if (field === 'messages') {
            // Process incoming messages
            const messages = value?.messages;
            if (messages && messages.length > 0) {
              for (const message of messages) {
                await processIncomingMessage(account, message, value?.contacts, pool);
              }
            }

            // Process message statuses
            const statuses = value?.statuses;
            if (statuses && statuses.length > 0) {
              for (const status of statuses) {
                await processMessageStatus(account, status, pool);
              }
            }
          } else if (field === 'message_template_status_update') {
            await handleTemplateStatusUpdate(businessAccountId, value);
          } else {
            logger.info(`Unhandled webhook field: ${field}`);
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error handling webhook message:', error);
    throw error;
  }
}

/**
 * Simple message processing without database (for testing)
 */
async function processIncomingMessageSimple(
  account: any,
  message: WhatsAppWebhookMessage,
  contacts: Array<{ profile: { name: string }; wa_id: string }> | undefined
): Promise<void> {
  const from = message.from;
  const messageId = message.id;
  const timestamp = new Date(parseInt(message.timestamp) * 1000);
  const type = message.type;

  const contact = contacts?.find((c) => c.wa_id === from);
  const customerName = contact?.profile?.name || 'Unknown';

  let messageContent = '';
  switch (type) {
    case 'text':
      messageContent = message.text?.body || '';
      break;
    case 'image':
      messageContent = message.image?.caption || '[Image]';
      break;
    case 'audio':
      messageContent = '[Voice message]';
      break;
    case 'video':
      messageContent = message.video?.caption || '[Video]';
      break;
    case 'document':
      messageContent = `[Document: ${message.document?.filename || 'document'}]`;
      break;
    default:
      messageContent = `[${type}]`;
  }

  logger.info('✅ Message received (no database):', {
    from: `${customerName} (${from})`,
    type,
    content: messageContent,
    messageId,
    timestamp: timestamp.toISOString()
  });
}

/**
 * Process incoming message for a specific client/chatbot
 */
async function processIncomingMessage(
  account: any,
  message: WhatsAppWebhookMessage,
  contacts: Array<{ profile: { name: string }; wa_id: string }> | undefined,
  pool: any
): Promise<void> {
  const from = message.from;
  const messageId = message.id;
  const timestamp = new Date(parseInt(message.timestamp) * 1000);
  const type = message.type;

  const contact = contacts?.find((c) => c.wa_id === from);
  const customerName = contact?.profile?.name || 'Unknown';

  logger.info('New message received:', {
    accountId: account.id,
    chatbotId: account.chatbot_id,
    from: `${customerName} (${from})`,
    type,
    messageId,
  });

  let messageContent = '';

  switch (type) {
    case 'text':
      messageContent = message.text?.body || '';
      break;
    case 'image':
      messageContent = message.image?.caption || '[Image]';
      break;
    case 'audio':
      messageContent = '[Voice message]';
      break;
    case 'video':
      messageContent = message.video?.caption || '[Video]';
      break;
    case 'document':
      messageContent = `[Document: ${message.document?.filename || 'document'}]`;
      break;
    case 'location':
      messageContent = `[Location: ${message.location?.latitude}, ${message.location?.longitude}]`;
      break;
    case 'button':
      messageContent = message.button?.text || '';
      break;
    case 'interactive':
      const interactiveType = message.interactive?.type;
      if (interactiveType === 'button_reply') {
        messageContent = message.interactive?.button_reply?.title || '';
      } else if (interactiveType === 'list_reply') {
        messageContent = message.interactive?.list_reply?.title || '';
      }
      break;
    default:
      messageContent = `[Unsupported message type: ${type}]`;
  }

  // Only process text/interactive messages for AI responses
  if (type !== 'text' && type !== 'button' && type !== 'interactive') {
    logger.info(`Skipping non-text/interactive message: ${type}`);
    return;
  }

  if (!messageContent) {
    logger.warn('Message content is empty, skipping');
    return;
  }

  try {
    // Get or create client user
    let clientUserResult = await pool.query(
      `SELECT id FROM whatsapp_client_users 
       WHERE whatsapp_account_id = $1 AND phone_number = $2 LIMIT 1`,
      [account.id, from]
    );

    let clientUserId: number;
    if (clientUserResult.rows.length === 0) {
      const insertResult = await pool.query(
        `INSERT INTO whatsapp_client_users 
         (whatsapp_account_id, phone_number, name, source, opt_in_status, created_at, updated_at)
         VALUES ($1, $2, $3, 'organic', true, NOW(), NOW())
         RETURNING id`,
        [account.id, from, customerName]
      );
      clientUserId = insertResult.rows[0].id;
    } else {
      clientUserId = clientUserResult.rows[0].id;
      // Update last seen
      await pool.query(
        `UPDATE whatsapp_client_users SET last_seen = NOW(), updated_at = NOW() WHERE id = $1`,
        [clientUserId]
      );
    }

    // Get or create conversation
    const waConversationId = `${from}_${account.id}`;
    let conversationResult = await pool.query(
      `SELECT id FROM whatsapp_conversations WHERE wa_conversation_id = $1 LIMIT 1`,
      [waConversationId]
    );

    let conversationId: number;
    if (conversationResult.rows.length === 0) {
      const insertResult = await pool.query(
        `INSERT INTO whatsapp_conversations 
         (whatsapp_account_id, whatsapp_client_user_id, wa_conversation_id, started_at, status, ai_involved, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'open', true, NOW(), NOW())
         RETURNING id`,
        [account.id, clientUserId, waConversationId, timestamp]
      );
      conversationId = insertResult.rows[0].id;
    } else {
      conversationId = conversationResult.rows[0].id;
      // Reopen if closed
      await pool.query(
        `UPDATE whatsapp_conversations SET status = 'open', updated_at = NOW() WHERE id = $1 AND status = 'closed'`,
        [conversationId]
      );
    }

    // Store user message
    const dbMessageType = (type === 'text' || type === 'button' || type === 'interactive') 
      ? 'text' 
      : type === 'image' || type === 'video' || type === 'document' 
        ? type 
        : 'text';

    await pool.query(
      `INSERT INTO whatsapp_messages 
       (conversation_id, wa_message_id, sender_type, message_type, content, status, timestamp, created_at, updated_at)
       VALUES ($1, $2, 'user', $3, $4, 'delivered', $5, NOW(), NOW())`,
      [conversationId, messageId, dbMessageType, messageContent, timestamp]
    );

    // Also store in unified messages table
    await pool.query(
      `INSERT INTO messages 
       (id, chatbot_id, channel, type, content, unique_conv_id, channel_message_metadata, created_at)
       VALUES (gen_random_uuid(), $1, 'WHATSAPP', 'user', $2, $3, $4, $5)`,
      [
        account.chatbot_id,
        messageContent,
        conversationId,
        JSON.stringify({
          phoneNumber: from,
          waMessageId: messageId,
          messageType: dbMessageType,
          timestamp: timestamp.toISOString(),
        }),
        timestamp,
      ]
    );

    // Get chatbot info for API call
    const chatbotResult = await pool.query(
      `SELECT id, api_key FROM chatbot WHERE id = $1 LIMIT 1`,
      [account.chatbot_id]
    );

    if (chatbotResult.rows.length === 0 || !chatbotResult.rows[0].api_key) {
      logger.error(`Chatbot not found or API key missing for chatbot ID: ${account.chatbot_id}`);
      return;
    }

    const chatbot = chatbotResult.rows[0];

    // Call lightning-response API
    const responseApiUrl = process.env.RESPONSE_API_BASE_URL || 'http://localhost:8030';
    const uniqueClientId = `whatsapp_${from}_${account.chatbot_id}`;

    // Get conversation history
    const historyResult = await pool.query(
      `SELECT content, sender_type FROM whatsapp_messages 
       WHERE conversation_id = $1 
       ORDER BY timestamp ASC 
       LIMIT 10`,
      [conversationId]
    );

    const messagesArray = historyResult.rows.map((msg: any) => ({
      role: msg.sender_type === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    const responseRequest = {
      query: JSON.stringify(messagesArray),
      mode: 'default',
      user: {
        uniqueClientId: uniqueClientId,
        converslyWebId: chatbot.api_key,
        metadata: {
          platform: 'whatsapp',
          phoneNumber: from,
        },
      },
      metadata: {
        originUrl: 'whatsapp://chat',
      },
      chatbotId: account.chatbot_id,
    };

    logger.info(`Calling lightning-response for chatbot ${account.chatbot_id}`);

    const startTime = Date.now();
    const response = await axios.post(
      `${responseApiUrl}/response`,
      responseRequest,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const responseData = response.data;
    const responseTime = Date.now() - startTime;

    if (responseData.success && responseData.response) {
      // Store AI response message
      const aiMessageId = responseData.message_id || `ai_${Date.now()}`;
      await pool.query(
        `INSERT INTO whatsapp_messages 
         (conversation_id, wa_message_id, sender_type, message_type, content, status, timestamp, response_time_ms, created_at, updated_at)
         VALUES ($1, $2, 'ai', 'text', $3, 'sent', NOW(), $4, NOW(), NOW())`,
        [conversationId, aiMessageId, responseData.response, responseTime]
      );

      // Send response back via WhatsApp API
      const sendResult = await sendWhatsAppMessage({
        phoneNumberId: account.phone_number_id,
        accessToken: account.access_token,
        to: from,
        message: responseData.response,
      });

      const finalMessageId = sendResult.messageId || aiMessageId;

      // Update message with WhatsApp message ID
      if (sendResult.messageId) {
        await pool.query(
          `UPDATE whatsapp_messages SET wa_message_id = $1, updated_at = NOW() WHERE wa_message_id = $2`,
          [sendResult.messageId, aiMessageId]
        );
      }

      // Store in unified messages table
      await pool.query(
        `INSERT INTO messages 
         (id, chatbot_id, channel, type, content, unique_conv_id, citations, channel_message_metadata, created_at)
         VALUES (gen_random_uuid(), $1, 'WHATSAPP', 'assistant', $2, $3, $4, $5, NOW())`,
        [
          account.chatbot_id,
          responseData.response,
          conversationId,
          JSON.stringify(responseData.citations || []),
          JSON.stringify({
            phoneNumber: from,
            waMessageId: finalMessageId,
            messageType: 'text',
            responseTimeMs: responseTime,
          }),
        ]
      );

      logger.info(`AI response sent successfully for chatbot ${account.chatbot_id}`);
    } else {
      logger.error('Failed to get response from lightning-response:', responseData);
      // Send error message
      await sendWhatsAppMessage({
        phoneNumberId: account.phone_number_id,
        accessToken: account.access_token,
        to: from,
        message: 'Sorry, I encountered an error processing your message. Please try again later.',
      });
    }
  } catch (error) {
    logger.error('Error processing incoming message:', error);
    // Try to send error message
    try {
      await sendWhatsAppMessage({
        phoneNumberId: account.phone_number_id,
        accessToken: account.access_token,
        to: from,
        message: 'Sorry, I encountered an error. Please try again later.',
      });
    } catch (sendError) {
      logger.error('Failed to send error message:', sendError);
    }
  }
}

/**
 * Process message status updates
 */
async function processMessageStatus(
  account: any,
  status: { id: string; status: string; timestamp: string; recipient_id: string; errors?: Array<{ code: number; title: string }> },
  pool: any
): Promise<void> {
  const messageId = status.id;
  const statusValue = status.status;

  logger.info('Message status update:', {
    accountId: account.id,
    messageId,
    status: statusValue,
    recipient: status.recipient_id,
  });

  if (statusValue === 'failed') {
    const errorCode = status.errors?.[0]?.code;
    const errorMessage = status.errors?.[0]?.title;
    logger.error('  Delivery failed:', errorCode, errorMessage);
  }

  // Update message status in database
  try {
    await pool.query(
      `UPDATE whatsapp_messages SET status = $1, updated_at = NOW() WHERE wa_message_id = $2`,
      [statusValue, messageId]
    );
  } catch (error) {
    logger.error(`Error updating message status for ${messageId}:`, error);
  }
}

/**
 * Send WhatsApp message via API
 */
async function sendWhatsAppMessage(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  message: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const url = `https://graph.facebook.com/v18.0/${params.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'text',
      text: {
        body: params.message,
      },
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const messageId = response.data?.messages?.[0]?.id;

    return {
      success: true,
      messageId: messageId,
    };
  } catch (error: any) {
    logger.error('Error sending WhatsApp message:', error);
    if (axios.isAxiosError(error)) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
    return {
      success: false,
      error: 'Unknown error sending message',
    };
  }
}

/**
 * Handle template status updates
 */
async function handleTemplateStatusUpdate(businessAccountId: string, value: any): Promise<void> {
  const { event, message_template_id, message_template_name, message_template_language } = value || {};

  logger.info('Template status update:', {
    template: message_template_name,
    language: message_template_language,
    event,
  });
}

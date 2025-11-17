import logger from '../config/logger';
import axios from 'axios';
import { getDbClient } from '../config/database';
import { createId } from '@paralleldrive/cuid2';

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
      phone_number: process.env.WHATSAPP_PHONE_NUMBER || process.env.WHATSAPP_DISPLAY_PHONE_NUMBER || 'Unknown'
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
          `SELECT id, chatbot_id, phone_number_id, access_token, waba_id, phone_number 
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
    // Get or create contact in whatsappContacts table
    const uniqueConvId = `whatsapp_${from}_${account.chatbot_id}`;
    
    let contactResult = await pool.query(
      `SELECT id FROM whatsapp_contacts 
       WHERE chatbot_id = $1 AND phone_number = $2 LIMIT 1`,
      [account.chatbot_id, from]
    );

    let contactId: string;
    if (contactResult.rows.length === 0) {
      // Create new contact - generate ID using createId()
      const newContactId = createId();
      const insertResult = await pool.query(
        `INSERT INTO whatsapp_contacts 
         (id, chatbot_id, phone_number, display_name, whatsapp_user_metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id`,
        [
          newContactId,
          account.chatbot_id,
          from,
          customerName,
          JSON.stringify({
            wa_id: from,
            profile: { name: customerName },
            first_seen_at: timestamp.toISOString(),
            last_seen_at: timestamp.toISOString(),
            last_inbound_message_id: messageId,
            waba_id: account.waba_id,
            phone_number_id: account.phone_number_id,
            display_phone_number: account.phone_number || '',
            source: 'organic',
            opt_in_status: true,
          }),
        ]
      );
      contactId = insertResult.rows[0].id;
    } else {
      contactId = contactResult.rows[0].id;
      // Update contact metadata
      // Cast json to jsonb for jsonb_set operation, then cast back to json
      await pool.query(
        `UPDATE whatsapp_contacts 
         SET display_name = $1, 
             whatsapp_user_metadata = (
               jsonb_set(
                 COALESCE(whatsapp_user_metadata::jsonb, '{}'::jsonb),
                 '{last_seen_at}',
                 to_jsonb($2::text)
               )
             )::json,
             updated_at = NOW()
         WHERE id = $3`,
        [customerName, timestamp.toISOString(), contactId]
      );
    }

    // Store message in unified messages table
    const dbMessageType = (type === 'text' || type === 'button' || type === 'interactive') 
      ? 'text' 
      : type === 'image' || type === 'video' || type === 'document' 
        ? type 
        : 'text';

    await pool.query(
      `INSERT INTO messages 
       (id, chatbot_id, channel, type, content, unique_conv_id, channel_message_metadata, created_at)
       VALUES (gen_random_uuid(), $1, 'WHATSAPP', 'user', $2, $3, $4, $5)`,
      [
        account.chatbot_id,
        messageContent,
        uniqueConvId,
        JSON.stringify({
          phoneNumber: from,
          waMessageId: messageId,
          messageType: dbMessageType,
          timestamp: timestamp.toISOString(),
          contactId: contactId,
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

    // Get conversation history from messages table
    const historyResult = await pool.query(
      `SELECT content, type FROM messages 
       WHERE chatbot_id = $1 AND unique_conv_id = $2 AND channel = 'WHATSAPP'
       ORDER BY created_at ASC 
       LIMIT 10`,
      [account.chatbot_id, uniqueConvId]
    );

    const messagesArray = historyResult.rows.map((msg: any) => ({
      role: msg.type === 'user' ? 'user' : 'assistant',
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
      // Send response back via WhatsApp API
      const sendResult = await sendWhatsAppMessage({
        phoneNumberId: account.phone_number_id,
        accessToken: account.access_token,
        to: from,
        message: responseData.response,
      });

      const finalMessageId = sendResult.messageId || `ai_${Date.now()}`;

      // Store AI response in unified messages table
      await pool.query(
        `INSERT INTO messages 
         (id, chatbot_id, channel, type, content, unique_conv_id, citations, channel_message_metadata, created_at)
         VALUES (gen_random_uuid(), $1, 'WHATSAPP', 'assistant', $2, $3, $4, $5, NOW())`,
        [
          account.chatbot_id,
          responseData.response,
          uniqueConvId,
          JSON.stringify(responseData.citations || []),
          JSON.stringify({
            phoneNumber: from,
            waMessageId: finalMessageId,
            messageType: 'text',
            responseTimeMs: responseTime,
            contactId: contactId,
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
  } catch (error: any) {
    // Log error safely (handle circular references)
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack || '';
    logger.error('Error processing incoming message:', {
      message: errorMessage,
      stack: errorStack,
      code: error?.code,
      detail: error?.detail,
    });
    // Try to send error message
    try {
      await sendWhatsAppMessage({
        phoneNumberId: account.phone_number_id,
        accessToken: account.access_token,
        to: from,
        message: 'Sorry, I encountered an error. Please try again later.',
      });
    } catch (sendError: any) {
      // Log send error safely
      const sendErrorMessage = sendError?.message || String(sendError);
      logger.error('Failed to send error message:', {
        message: sendErrorMessage,
        code: sendError?.code,
      });
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

  // Update message status in database (messages table)
  try {
    await pool.query(
      `UPDATE messages 
       SET channel_message_metadata = jsonb_set(
         COALESCE(channel_message_metadata, '{}'::jsonb),
         '{status}',
         to_jsonb($1::text)
       )
       WHERE channel = 'WHATSAPP' 
       AND channel_message_metadata->>'waMessageId' = $2`,
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

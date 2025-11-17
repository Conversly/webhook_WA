# Multi-Client/User Support Guide

## Overview

The WhatsApp Webhook Service is designed to handle messages from **multiple clients and users** simultaneously. Each client (chatbot) can have their own WhatsApp Business account, and the service automatically routes messages to the correct client based on the phone number ID.

## How It Works

### 1. **Multi-Client Architecture**

The service supports multiple clients by:
- **Phone Number ID Lookup**: When a message arrives, the service looks up which client(s) own that phone number ID
- **Database-Driven Routing**: Each WhatsApp account in the database is linked to a specific chatbot/client
- **Independent Processing**: Each client's messages are processed independently with their own:
  - Chatbot configuration
  - API keys
  - Conversation history
  - AI responses

### 2. **Webhook Verification**

The service supports multiple verify tokens:
- **Database Lookup**: Checks `whatsapp_accounts` table for matching `verify_token`
- **Fallback**: Uses `WHATSAPP_VERIFY_TOKEN` environment variable if database lookup fails
- **Multiple Tokens**: Each client can have a different verify token

### 3. **Message Processing Flow**

```
WhatsApp Message → Webhook Service
    ↓
Extract phone_number_id
    ↓
Query Database: Find all active accounts with this phone_number_id
    ↓
For each account (client):
    ├─ Identify chatbot
    ├─ Get conversation history
    ├─ Call AI response API (with chatbot's API key)
    ├─ Store message in database
    └─ Send reply via WhatsApp API
```

## Setup for Multiple Clients

### Step 1: Create WhatsApp Integration for Each Client

Each client/user creates their WhatsApp integration via the main API:

```bash
POST /api/v1/whatsapp/integration
{
  "chatbotId": "client-1-chatbot-id",
  "phoneNumberId": "123456789",
  "accessToken": "client-1-access-token",
  "verifyToken": "client-1-verify-token",
  "businessAccountId": "client-1-waba-id",
  "webhookUrl": "https://webhook-wa-mcnp.onrender.com/webhook"
}
```

### Step 2: Configure Webhook in Meta Console

**Important**: All clients should use the **same webhook URL**:

```
https://webhook-wa-mcnp.onrender.com/webhook
```

But each client can have a **different verify token** (stored in database).

### Step 3: Service Automatically Routes Messages

The webhook service:
1. Receives message with `phone_number_id`
2. Looks up which client(s) own that phone number
3. Processes message for each client independently
4. Uses each client's own:
   - Chatbot ID
   - API key
   - Access token
   - Configuration

## Database Schema

### Key Tables

1. **whatsapp_accounts**: Links phone numbers to chatbots
   ```sql
   - id
   - chatbot_id (links to specific client)
   - phone_number_id (WhatsApp phone number ID)
   - verify_token (unique per client)
   - access_token
   ```

2. **whatsapp_conversations**: Tracks conversations per client
   ```sql
   - whatsapp_account_id (links to account)
   - chatbot_id (links to client)
   ```

3. **messages**: Unified message storage
   ```sql
   - chatbot_id (identifies which client)
   - channel = 'WHATSAPP'
   ```

## Example: Multiple Clients

### Client 1: E-commerce Store
- **Phone Number ID**: `123456789`
- **Chatbot ID**: `ecommerce-chatbot-id`
- **Verify Token**: `ecommerce-token-123`
- **Webhook URL**: `https://webhook-wa-mcnp.onrender.com/webhook`

### Client 2: Customer Support
- **Phone Number ID**: `987654321`
- **Chatbot ID**: `support-chatbot-id`
- **Verify Token**: `support-token-456`
- **Webhook URL**: `https://webhook-wa-mcnp.onrender.com/webhook` (same URL!)

### How Messages Are Routed

**Message to Client 1's number:**
```
WhatsApp → Webhook Service
Phone Number ID: 123456789
    ↓
Database Query: SELECT * FROM whatsapp_accounts WHERE phone_number_id = '123456789'
    ↓
Found: ecommerce-chatbot-id
    ↓
Process with ecommerce-chatbot-id's API key
    ↓
Store in ecommerce-chatbot-id's conversations
```

**Message to Client 2's number:**
```
WhatsApp → Webhook Service
Phone Number ID: 987654321
    ↓
Database Query: SELECT * FROM whatsapp_accounts WHERE phone_number_id = '987654321'
    ↓
Found: support-chatbot-id
    ↓
Process with support-chatbot-id's API key
    ↓
Store in support-chatbot-id's conversations
```

## Environment Variables

The webhook service needs these environment variables:

```bash
# Database (shared by all clients)
DATABASE_URL=postgresql://user:password@host:port/database

# Fallback verify token (if not using database lookup)
WHATSAPP_VERIFY_TOKEN=fallback-token

# Facebook App Secret (for signature verification)
FACEBOOK_APP_SECRET=your-app-secret

# Response API (for AI responses)
RESPONSE_API_BASE_URL=https://your-response-api.com
```

## Verification Flow

### Single Verify Token (Simple)
- Set `WHATSAPP_VERIFY_TOKEN` environment variable
- All clients use same token
- Works for single client or testing

### Multiple Verify Tokens (Production)
- Each client has unique `verify_token` in database
- Service looks up token in `whatsapp_accounts` table
- Supports unlimited clients

## Best Practices

1. **Unique Verify Tokens**: Use different verify tokens per client for better security
2. **Shared Webhook URL**: All clients point to same webhook service URL
3. **Database Indexing**: Ensure `phone_number_id` is indexed for fast lookups
4. **Error Handling**: Each client's errors are logged separately
5. **Monitoring**: Track messages per `chatbot_id` for analytics

## Troubleshooting

### Messages Not Routing Correctly

**Problem**: Message goes to wrong client

**Solution**:
- Check `phone_number_id` matches in database
- Verify `whatsapp_accounts.phone_number_id` is correct
- Check account status is 'active'

### Verify Token Issues

**Problem**: Webhook verification fails

**Solution**:
- Check verify token in database matches Meta Console
- Verify token is set when creating integration
- Check account status is 'active'

### Multiple Accounts Same Phone

**Problem**: Multiple chatbots using same phone number

**Solution**:
- Service processes message for ALL matching accounts
- Each chatbot gets its own conversation
- Consider if this is desired behavior

## API Integration

The webhook service calls your response API with:

```json
{
  "query": "[conversation history]",
  "chatbotId": "specific-client-chatbot-id",
  "user": {
    "uniqueClientId": "whatsapp_phone_chatbot-id",
    "converslyWebId": "client-specific-api-key"
  }
}
```

Each client's API key is automatically used from the database.

## Summary

✅ **One webhook service** handles **all clients**
✅ **Automatic routing** based on phone number ID
✅ **Independent processing** per client
✅ **Database-driven** configuration
✅ **Scalable** to unlimited clients

The service is designed to be **multi-tenant** from the ground up!



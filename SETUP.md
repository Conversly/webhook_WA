# Setup Checklist for WhatsApp Webhook Service

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database (shared with other services)
- Access to WhatsApp Business API credentials

## Step 1: Install Dependencies

```bash
npm install
```

This will install all required packages including:
- `express` - Web server
- `pg` - PostgreSQL client
- `drizzle-orm` - ORM (schema definitions)
- `@paralleldrive/cuid2` - ID generation
- `axios` - HTTP client for API calls
- `winston` - Logging
- `dotenv` - Environment variables

## Step 2: Environment Variables

Create a `.env` file in the root directory with the following variables:

```bash
# Server Configuration
PORT=3000

# Database Configuration
# PostgreSQL connection string for the shared database
DATABASE_URL=postgresql://user:password@host:port/database

# WhatsApp Webhook Configuration
# Verify token for webhook verification (fallback if not using database lookup)
# Each client can have their own verify_token stored in whatsapp_accounts table
WHATSAPP_VERIFY_TOKEN=your-default-verify-token

# Facebook App Secret (for webhook signature verification)
# Optional but recommended for production security
FACEBOOK_APP_SECRET=your-facebook-app-secret

# Response API Configuration
# Base URL for your AI response API (lightning-response service)
RESPONSE_API_BASE_URL=http://localhost:8030

# Logging Configuration
LOG_LEVEL=info

# Fallback Configuration (for testing without database)
# These are only used if DATABASE_URL is not set
CHATBOT_ID=test-chatbot-id
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_BUSINESS_ACCOUNT_ID=your-waba-id
WHATSAPP_PHONE_NUMBER=your-phone-number
WHATSAPP_DISPLAY_PHONE_NUMBER=your-display-phone-number
```

## Step 3: Database Setup

The service expects these tables to exist in your PostgreSQL database:

### Required Tables:

1. **chatbot** - Minimal table with:
   - `id` (text, primary key)
   - `api_key` (varchar, nullable)

2. **whatsapp_accounts** - WhatsApp account configuration:
   - `id` (text, primary key)
   - `chatbot_id` (text, foreign key to chatbot.id)
   - `phone_number` (varchar, unique)
   - `phone_number_id` (varchar)
   - `waba_id` (varchar)
   - `access_token` (text)
   - `verified_name` (varchar)
   - `status` (enum: 'active', 'inactive')
   - `whatsapp_business_id` (varchar)
   - `webhook_url` (text, nullable)
   - `verify_token` (varchar, nullable)
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

3. **whatsapp_contacts** - Contact information:
   - `id` (text, primary key)
   - `chatbot_id` (text, foreign key to chatbot.id)
   - `phone_number` (varchar)
   - `display_name` (varchar, nullable)
   - `whatsapp_user_metadata` (json)
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

4. **messages** - Message storage:
   - `id` (text, primary key)
   - `unique_conv_id` (text, nullable)
   - `chatbot_id` (text, foreign key to chatbot.id)
   - `channel` (enum: 'WIDGET', 'WHATSAPP')
   - `type` (enum: 'user', 'assistant', 'agent')
   - `content` (text)
   - `citations` (text array)
   - `feedback` (smallint)
   - `feedback_comment` (text, nullable)
   - `channel_message_metadata` (json, nullable)
   - `created_at` (timestamp)
   - `topic_id` (text, nullable)

### Database Migrations

If you're using Drizzle ORM migrations, you can generate migrations from `schema.ts`:

```bash
# Install drizzle-kit if not already installed
npm install -D drizzle-kit

# Generate migrations
npx drizzle-kit generate

# Run migrations
npx drizzle-kit migrate
```

Or use your existing migration system to create these tables based on the schema.

## Step 4: Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

## Step 5: Run the Service

### Development Mode (with hot reload):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

The service will start on the port specified in `PORT` environment variable (default: 3000).

## Step 6: Verify Setup

### 1. Check Health Endpoint
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "OK",
  "message": "WhatsApp Webhook Service is running",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

### 2. Test Webhook Verification
```bash
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

Should return the challenge string if token matches.

### 3. Check Database Connection
Check logs for:
```
🛡️  Database connection established successfully  🛡️
```

## Step 7: Configure WhatsApp Webhook

1. **Deployed Service URL**: `https://webhook-wa-mcnp.onrender.com` (or use ngrok URL for local testing)
2. Go to [Meta Developer Console](https://developers.facebook.com/)
3. Navigate to your WhatsApp Business App
4. Go to **WhatsApp → Configuration**
5. Set **Webhook URL**: `https://webhook-wa-mcnp.onrender.com/webhook`
6. Set **Verify Token**: Must match `verify_token` in `whatsapp_accounts` table (or `WHATSAPP_VERIFY_TOKEN` env var)
7. Subscribe to fields: `messages`, `message_template_status_update`
8. Click **Verify and Save**

## Multi-Client Setup

For multiple clients:

1. Each client creates a WhatsApp integration via your main API
2. The integration creates a record in `whatsapp_accounts` table with:
   - `chatbot_id` - Links to their chatbot
   - `phone_number_id` - Their WhatsApp phone number ID
   - `verify_token` - Their unique verify token (optional, can use shared token)
   - `access_token` - Their WhatsApp access token
   - Other required fields

3. All clients use the **same webhook URL**
4. The service automatically routes messages to the correct client based on `phone_number_id`

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Check database is accessible from your network
- Ensure database user has proper permissions

### Webhook Verification Fails
- Check `verify_token` in database matches Meta Console
- Verify `WHATSAPP_VERIFY_TOKEN` env var if not using database lookup
- Ensure webhook URL is accessible (HTTPS required for production)

### Messages Not Processing
- Check `phone_number_id` in webhook payload matches database
- Verify account status is 'active' in `whatsapp_accounts` table
- Check logs for error messages
- Verify `RESPONSE_API_BASE_URL` is correct and accessible

### Missing Dependencies
If you see errors about missing modules:
```bash
npm install
```

### TypeScript Errors
If you see TypeScript compilation errors:
```bash
npm run build
```

Check that all types are properly imported and schema matches your database.

## Next Steps

- Set up monitoring and logging
- Configure production environment variables
- Set up SSL/HTTPS (handled by hosting provider)
- Review security settings
- Test with actual WhatsApp messages


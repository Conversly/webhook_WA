# WhatsApp Webhook Service

A standalone Express.js service for receiving and processing WhatsApp Business API webhooks. **Supports multiple clients/users** - one service handles all your WhatsApp integrations!

## Features

- ✅ **Multi-Client Support** - Handles messages from multiple clients/users automatically
- ✅ Webhook verification (GET `/webhook`) - Supports multiple verify tokens
- ✅ Message reception (POST `/webhook`) - Routes to correct client based on phone number
- ✅ Database integration - Stores messages and conversations per client
- ✅ AI response integration - Calls your response API with client-specific keys
- ✅ Signature verification for security
- ✅ Health check endpoint
- ✅ Graceful shutdown handling
- ✅ Comprehensive logging

## Quick Start

### Local Development

```bash
# Install dependencies
npm install
# or
yarn install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration

# Run in development mode
npm run dev
# or
yarn dev

# Build and run production
npm run build
npm start
```

### Environment Variables

Create a `.env` file with the following variables:

```bash
PORT=3000
DATABASE_URL=postgresql://user:password@host:port/database
WHATSAPP_VERIFY_TOKEN=your-verify-token
FACEBOOK_APP_SECRET=your-facebook-app-secret
RESPONSE_API_BASE_URL=https://your-api.com
LOG_LEVEL=info
```

## Deployment on Render

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/whatsapp-webhook-service.git
git push -u origin main
```

### Step 2: Deploy on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `whatsapp-webhook-service`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. Add environment variables (see `.env.example`)
6. Click **Create Web Service**

### Step 3: Configure WhatsApp Webhook

1. **Deployed Service URL**: `https://webhook-wa-mcnp.onrender.com`
2. Go to [Meta Developer Console](https://developers.facebook.com/)
3. Navigate to your WhatsApp Business App
4. Go to **WhatsApp → Configuration**
5. Set **Webhook URL**: `https://webhook-wa-mcnp.onrender.com/webhook`
6. Set **Verify Token**: Must match `verify_token` in `whatsapp_accounts` table (or `WHATSAPP_VERIFY_TOKEN` env var)
7. Subscribe to fields: `messages`, `message_template_status_update`
8. Click **Verify and Save**

## API Endpoints

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "OK",
  "message": "WhatsApp Webhook Service is running",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

### GET /webhook

Webhook verification endpoint (called by WhatsApp).

**Query Parameters:**
- `hub.mode`: Must be `subscribe`
- `hub.verify_token`: Must match `WHATSAPP_VERIFY_TOKEN`
- `hub.challenge`: Challenge string from WhatsApp

**Response:** Challenge string (200) or `Forbidden` (403)

### POST /webhook

Webhook message handler (called by WhatsApp).

**Headers:**
- `x-hub-signature-256`: Signature for verification (optional but recommended)

**Body:** WhatsApp webhook payload

**Response:**
```json
{
  "success": true,
  "message": "Webhook received"
}
```

## Testing

### Test Health Endpoint

```bash
curl http://localhost:3000/health
```

### Test Webhook Verification

```bash
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

### Test with ngrok (Local Development)

Since WhatsApp requires HTTPS:

```bash
# Install ngrok: https://ngrok.com/download

# Start service
npm run dev

# In another terminal, expose port 3000
ngrok http 3000

# Use the ngrok URL in Meta Developer Console
```

## Project Structure

```
whatsapp-webhook-service/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── config/
│   │   ├── database.ts         # Database configuration
│   │   └── logger.ts           # Logger configuration
│   ├── services/
│   │   └── webhook-handler.ts  # Webhook processing logic
│   └── utils/
│       └── webhook.ts          # Webhook utilities
├── .env.example                # Environment variables template
├── package.json
├── tsconfig.json
└── README.md
```

## Multi-Client Support

This service automatically supports **multiple clients/users**. Each client:
- Has their own WhatsApp Business account
- Uses the same webhook URL
- Gets messages routed to their chatbot automatically
- Has independent conversations and AI responses

See [MULTI_CLIENT_GUIDE.md](./MULTI_CLIENT_GUIDE.md) for detailed information.

### How It Works

1. **Client creates WhatsApp integration** via your main API
2. **All clients use same webhook URL**: `https://webhook-wa-mcnp.onrender.com/webhook`
3. **Service looks up client** by phone number ID from database
4. **Messages routed automatically** to correct client's chatbot
5. **AI responses** use each client's own API key

### Database Integration

The service already includes full database integration:
- ✅ Stores messages per client
- ✅ Tracks conversations
- ✅ Links to chatbot IDs
- ✅ Supports multiple WhatsApp accounts

### AI Response Integration

The service automatically:
- ✅ Calls your response API with client-specific API key
- ✅ Includes conversation history
- ✅ Sends replies via WhatsApp API
- ✅ Stores responses in database

## Security

- ✅ Signature verification using `FACEBOOK_APP_SECRET`
- ✅ Verify token validation
- ✅ HTTPS required for production (Render provides this)
- ✅ Environment variables for sensitive data

## Monitoring

- Check Render logs: Dashboard → Your Service → Logs
- Health check endpoint: `/health`
- All events are logged with Winston logger

## Troubleshooting

### Webhook Verification Fails (403)

- Check `WHATSAPP_VERIFY_TOKEN` matches Meta Console
- Ensure token is set in environment variables

### Signature Verification Fails (401)

- Verify `FACEBOOK_APP_SECRET` matches Meta App Secret
- Check environment variable is set correctly

### No Messages Received

- Verify webhook URL is correct in Meta Console
- Check webhook is subscribed to `messages` field
- Review Render logs for errors

## License

ISC


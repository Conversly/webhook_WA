# Deployment Information

## 🚀 Live Service

**Service URL**: `https://webhook-wa-mcnp.onrender.com`

**Webhook Endpoint**: `https://webhook-wa-mcnp.onrender.com/webhook`

**Health Check**: `https://webhook-wa-mcnp.onrender.com/health`

## ✅ Service Status

The service is **deployed and running** on Render.

### Verification

```bash
# Health check
curl https://webhook-wa-mcnp.onrender.com/health

# Expected response:
# {"status":"OK","message":"WhatsApp Webhook Service is running",...}
```

## 📋 Configuration for WhatsApp

### Meta Developer Console Setup

1. Go to [Meta Developer Console](https://developers.facebook.com/)
2. Navigate to your WhatsApp Business App
3. Go to **WhatsApp → Configuration**
4. Set **Webhook URL**: `https://webhook-wa-mcnp.onrender.com/webhook`
5. Set **Verify Token**: 
   - Must match `verify_token` in `whatsapp_accounts` table for multi-client support
   - OR use `WHATSAPP_VERIFY_TOKEN` environment variable (fallback)
6. Subscribe to fields:
   - ✅ `messages`
   - ✅ `message_template_status_update`
7. Click **Verify and Save**

## 🔐 Multi-Client Support

This service supports **multiple clients** using the same webhook URL:

- Each client has their own `verify_token` stored in `whatsapp_accounts` table
- Messages are routed automatically based on `phone_number_id`
- Each client's messages are processed independently with their own:
  - Chatbot ID
  - API key
  - Access token
  - Conversation history

## 📊 Monitoring

- **Logs**: Check Render Dashboard → Service → Logs
- **Health**: `GET /health` endpoint
- **Metrics**: Available in Render Dashboard

## 🔄 Updates

To update the service:
1. Make changes locally
2. Commit and push to GitHub
3. Render automatically rebuilds and redeploys

## 📝 Environment Variables

Required environment variables in Render:
- `DATABASE_URL` - PostgreSQL connection string
- `WHATSAPP_VERIFY_TOKEN` - Fallback verify token (optional if using database)
- `FACEBOOK_APP_SECRET` - For signature verification
- `RESPONSE_API_BASE_URL` - AI response API URL
- `PORT` - Server port (default: 3000)
- `LOG_LEVEL` - Logging level (default: info)

## 🆘 Troubleshooting

### Webhook Verification Fails
- Check `verify_token` in database matches Meta Console
- Verify webhook URL is correct: `https://webhook-wa-mcnp.onrender.com/webhook`
- Check Render logs for errors

### Messages Not Received
- Verify webhook is subscribed to `messages` field
- Check `phone_number_id` in webhook matches database
- Ensure account status is 'active' in `whatsapp_accounts` table
- Review Render logs for processing errors

### Service Not Responding
- Check Render service status
- Verify health endpoint: `curl https://webhook-wa-mcnp.onrender.com/health`
- Review Render logs for startup errors


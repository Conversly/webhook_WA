# Deployment Guide - WhatsApp Webhook Service

## Quick Deploy on Render

### Step 1: Push to GitHub

```bash
cd whatsapp-webhook-service
git init
git add .
git commit -m "Initial commit: WhatsApp Webhook Service"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/whatsapp-webhook-service.git
git push -u origin main
```

### Step 2: Deploy on Render

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click**: New → Web Service
3. **Connect Repository**: Select your GitHub repository
4. **Configure Service**:
   - **Name**: `whatsapp-webhook-service`
   - **Environment**: `Node`
   - **Region**: Choose closest to your users
   - **Branch**: `main`
   - **Root Directory**: (leave empty)
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. **Click**: Create Web Service

### Step 3: Configure Environment Variables

In Render Dashboard → Your Service → Environment → Add Environment Variables:

```bash
# Required
NODE_ENV=production
PORT=3000
WHATSAPP_VERIFY_TOKEN=your-verify-token-here
FACEBOOK_APP_SECRET=your-facebook-app-secret

# Optional (if you need database)
DATABASE_URL=postgresql://user:password@host:port/database

# Optional (for AI responses)
RESPONSE_API_BASE_URL=https://your-api.com

# Optional
LOG_LEVEL=info
```

### Step 4: Get Your Service URL

**Deployed Service URL**: 
```
https://webhook-wa-mcnp.onrender.com
```

### Step 5: Configure WhatsApp Webhook

1. **Go to Meta Developer Console**: https://developers.facebook.com/
2. **Select your WhatsApp Business App**
3. **Navigate to**: WhatsApp → Configuration
4. **Set Webhook URL**: 
   ```
   https://webhook-wa-mcnp.onrender.com/webhook
   ```
5. **Set Verify Token**: Must match `verify_token` in `whatsapp_accounts` table (or `WHATSAPP_VERIFY_TOKEN` env var)
6. **Subscribe to Fields**: 
   - ✅ `messages`
   - ✅ `message_template_status_update`
7. **Click**: Verify and Save

### Step 6: Test Your Deployment

1. **Health Check**:
   ```bash
   curl https://webhook-wa-mcnp.onrender.com/health
   ```

2. **Send Test Message**: Send a WhatsApp message to your business number and check Render logs

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | Yes | Environment (production/development) |
| `WHATSAPP_VERIFY_TOKEN` | Yes | Token for webhook verification |
| `FACEBOOK_APP_SECRET` | Yes | App secret for signature verification |
| `DATABASE_URL` | No | PostgreSQL connection string |
| `RESPONSE_API_BASE_URL` | No | URL for AI response API |
| `LOG_LEVEL` | No | Logging level (default: info) |

## Testing Locally Before Deployment

### Using ngrok

```bash
# Install ngrok: https://ngrok.com/download

# Start service
npm run dev

# In another terminal
ngrok http 3000

# Use ngrok URL in Meta Console for testing
```

## Troubleshooting

### Build Fails

- Check Node.js version (should be 18+)
- Verify all dependencies in `package.json`
- Check Render build logs

### Service Won't Start

- Verify `PORT` environment variable
- Check start command: `npm start`
- Review Render logs for errors

### Webhook Verification Fails

- Ensure `WHATSAPP_VERIFY_TOKEN` matches Meta Console
- Check webhook URL is correct
- Verify HTTPS is enabled (Render provides this)

### No Messages Received

- Verify webhook is subscribed to `messages` field
- Check Render logs for incoming requests
- Ensure phone number is verified in Meta

## Monitoring

- **Logs**: Render Dashboard → Your Service → Logs
- **Health**: `GET /health` endpoint
- **Metrics**: Render provides basic metrics in dashboard

## Updating Your Service

```bash
# Make changes locally
git add .
git commit -m "Update webhook service"
git push

# Render will automatically rebuild and redeploy
```

## Custom Domain (Optional)

1. In Render Dashboard → Your Service → Settings
2. Add Custom Domain
3. Update DNS records as instructed
4. Update webhook URL in Meta Console

## Support

- Render Docs: https://render.com/docs
- Render Status: https://status.render.com
- Meta WhatsApp API: https://developers.facebook.com/docs/whatsapp


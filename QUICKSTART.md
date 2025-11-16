# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### 1. Install Dependencies

```bash
cd whatsapp-webhook-service
npm install
```

### 2. Configure Environment

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```bash
PORT=3000
WHATSAPP_VERIFY_TOKEN=your-secret-token-here
FACEBOOK_APP_SECRET=your-facebook-app-secret
```

### 3. Run Locally

```bash
# Development mode
npm run dev

# Or build and run
npm run build
npm start
```

### 4. Test Health Endpoint

```bash
curl http://localhost:3000/health
```

### 5. Deploy on Render

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/whatsapp-webhook-service.git
   git push -u origin main
   ```

2. **Deploy on Render**:
   - Go to https://dashboard.render.com
   - New → Web Service
   - Connect your GitHub repo
   - Build: `npm install && npm run build`
   - Start: `npm start`
   - Add environment variables
   - Deploy!

3. **Get URL**: `https://your-service.onrender.com`

4. **Configure WhatsApp**:
   - Meta Console → WhatsApp → Configuration
   - Webhook URL: `https://your-service.onrender.com/webhook`
   - Verify Token: (your `WHATSAPP_VERIFY_TOKEN`)
   - Subscribe: `messages`, `message_template_status_update`

## ✅ Done!

Your webhook service is now live and ready to receive WhatsApp messages!

## Next Steps

- Customize `src/services/webhook-handler.ts` to add your business logic
- Add database integration if needed
- Set up monitoring and alerts
- See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions


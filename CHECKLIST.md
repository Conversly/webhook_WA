# Pre-Run Checklist

## ✅ Required Updates Made

1. **Schema Updated** (`schema.ts`)
   - ✅ Removed unnecessary tables (handled by other services)
   - ✅ Kept only: `whatsappAccounts`, `whatsappContacts`, `messages`, `chatBots`
   - ✅ Added indexes for multi-client support
   - ✅ Matches your provided schema exactly

2. **Dependencies Updated** (`package.json`)
   - ✅ Added `@paralleldrive/cuid2` dependency

3. **Code Updated** (`src/services/webhook-handler.ts`)
   - ✅ Changed `display_phone_number` → `phone_number` in SQL queries
   - ✅ Updated field mappings to match schema

## 📋 Before Running - Required Steps

### 1. Install Dependencies
```bash
npm install
```

This will install the newly added `@paralleldrive/cuid2` package.

### 2. Create `.env` File
Create a `.env` file in the root directory with:

```bash
# Required
PORT=3000
DATABASE_URL=postgresql://user:password@host:port/database

# Optional (for fallback mode)
WHATSAPP_VERIFY_TOKEN=your-verify-token
FACEBOOK_APP_SECRET=your-app-secret
RESPONSE_API_BASE_URL=http://localhost:8030
LOG_LEVEL=info
```

### 3. Database Setup

Ensure these tables exist in your PostgreSQL database:

#### `chatbot` table (minimal):
```sql
CREATE TABLE chatbot (
  id TEXT PRIMARY KEY,
  api_key VARCHAR(255)
);
```

#### `whatsapp_accounts` table:
- Must match the schema in `schema.ts`
- Key fields: `id`, `chatbot_id`, `phone_number`, `phone_number_id`, `verify_token`, `access_token`, `status`
- Indexes: `phone_number_id`, `verify_token`, `chatbot_id`, `phone_number`

#### `whatsapp_contacts` table:
- Must match the schema in `schema.ts`
- Key fields: `id`, `chatbot_id`, `phone_number`, `display_name`, `whatsapp_user_metadata`

#### `messages` table:
- Must match the schema in `schema.ts`
- Key fields: `id`, `chatbot_id`, `channel`, `type`, `content`, `unique_conv_id`, `channel_message_metadata`

**Note**: The code uses `gen_random_uuid()` for message IDs in SQL, which is fine - PostgreSQL's native UUID function.

### 4. Verify Database Connection

The service will automatically connect to the database on startup. Check logs for:
```
🛡️  Database connection established successfully  🛡️
```

If you see errors, verify:
- `DATABASE_URL` is correct
- Database is accessible
- Tables exist with correct schema

### 5. Build the Project
```bash
npm run build
```

### 6. Run the Service

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

## 🔍 Verification Steps

### 1. Health Check
```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "OK",
  "message": "WhatsApp Webhook Service is running",
  ...
}
```

### 2. Webhook Verification Test
```bash
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

Should return the challenge string if token matches.

### 3. Check Logs
Look for:
- ✅ Database connection successful
- ✅ Server started on port 3000
- ✅ No TypeScript compilation errors

## ⚠️ Common Issues

### Issue: `@paralleldrive/cuid2` not found
**Solution**: Run `npm install`

### Issue: Database connection fails
**Solution**: 
- Check `DATABASE_URL` format: `postgresql://user:password@host:port/database`
- Verify database is accessible
- Check network/firewall settings

### Issue: Tables don't exist
**Solution**: 
- Run database migrations
- Or create tables manually based on `schema.ts`
- Ensure foreign key constraints match

### Issue: Webhook verification fails
**Solution**:
- Check `verify_token` in `whatsapp_accounts` table matches Meta Console
- Or set `WHATSAPP_VERIFY_TOKEN` env var for fallback

### Issue: Messages not routing to correct client
**Solution**:
- Verify `phone_number_id` in webhook payload matches `whatsapp_accounts.phone_number_id`
- Check account `status` is 'active'
- Verify `chatbot_id` exists in `chatbot` table

## 📝 Field Mapping Reference

As per your requirements:
- `verifyToken` (code) → `verify_token` (database) ✅
- `display_phone_number` (code) → `phone_number` (database) ✅
- `phoneNumberId` (code) → `phone_number_id` (database) ✅

## 🚀 Ready to Run

Once all checklist items are complete:
1. ✅ Dependencies installed
2. ✅ `.env` file created
3. ✅ Database tables exist
4. ✅ Service builds successfully
5. ✅ Health check passes

You're ready to receive WhatsApp webhooks!


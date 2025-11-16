import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { initializeDatabase, closeDatabaseConnection } from './config/database';
import logger from './config/logger';
import { verifyWebhookSignature } from './utils/webhook';
import { handleWebhookVerify, handleWebhookMessage } from './services/webhook-handler';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON and capture raw body for signature verification
app.use(
  express.json({
    verify: (req: Request, res: Response, buf: Buffer) => {
      try {
        (req as any).rawBody = buf.toString('utf8');
      } catch (err) {
        (req as any).rawBody = '';
        logger.error('Error capturing raw body:', err);
      }
    },
  })
);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'WhatsApp Webhook Service is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Webhook verification endpoint (GET request from WhatsApp)
app.get('/webhook', async (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string;
  const verifyToken = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  logger.info('GET /webhook - Verification attempt:', {
    mode,
    token: verifyToken ? 'present' : 'missing',
    challenge: challenge ? 'present' : 'missing',
  });

  if (mode !== 'subscribe') {
    logger.warn('Webhook verification failed: mode is not "subscribe"');
    return res.status(403).send('Forbidden');
  }

  try {
    const challengeResponse = await handleWebhookVerify(verifyToken, challenge);
    logger.info('Webhook verified successfully');
    res.status(200).send(challengeResponse);
  } catch (error: any) {
    logger.warn('Webhook verification failed:', error.message);
    res.status(403).send('Forbidden');
  }
});

// Webhook message handler (POST request from WhatsApp)
app.post('/webhook', async (req: Request, res: Response) => {
  const payload = req.body;

  logger.info('POST /webhook - Received:', JSON.stringify(payload, null, 2));

  // Verify webhook signature (recommended for production)
  const signature = req.get('x-hub-signature-256');
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (signature && appSecret) {
    const rawBody = (req as any).rawBody || JSON.stringify(payload);
    const isValid = verifyWebhookSignature(rawBody, signature, appSecret);

    if (!isValid) {
      logger.error('Invalid webhook signature');
      return res.status(401).json({
        success: false,
        error: 'Invalid signature',
      });
    }
  } else if (signature && !appSecret) {
    logger.warn('Webhook signature present but FACEBOOK_APP_SECRET not configured');
  }

  // Verify it's a WhatsApp webhook
  if (payload.object !== 'whatsapp_business_account') {
    logger.warn('POST /webhook - Not a WhatsApp webhook event. Body object:', payload.object);
    return res.status(200).json({
      success: true,
      message: 'Not a WhatsApp webhook event',
    });
  }

  // Process webhook asynchronously
  handleWebhookMessage(payload).catch((error) => {
    logger.error('Error processing webhook message:', error);
  });

  // Respond immediately to WhatsApp
  res.status(200).json({
    success: true,
    message: 'Webhook received',
  });
});

// Graceful shutdown handler
const shutdown = async (signal: string) => {
  logger.info(`${signal} received, closing server gracefully...`);

  try {
    await closeDatabaseConnection();
    logger.info('All connections closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Initialize and start server
async function startServer() {
  try {
    // Initialize database connection
    await initializeDatabase();
    logger.info('Database connection established');

    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`🚀 WhatsApp Webhook Service running on port ${PORT}`);
      logger.info(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
      logger.info(`❤️  Health check: http://localhost:${PORT}/health`);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    server.on('error', (err: Error) => {
      logger.error('Server error:', err);
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;


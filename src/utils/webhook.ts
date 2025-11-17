import crypto from 'crypto';
import logger from '../config/logger';

/**
 * Verify webhook signature from WhatsApp/Meta
 * @param payload - Raw request body as string
 * @param signature - Signature from x-hub-signature-256 header
 * @param appSecret - Facebook App Secret
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  try {
    const expected = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);

    if (sigBuf.length !== expBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (error) {
    logger.error('Signature verification error:', error);
    return false;
  }
}



import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';

// Safe JSON stringify that handles circular references
const safeStringify = (obj: any): string => {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    // Remove circular references from common axios error properties
    if (key === 'request' || key === 'response' || key === 'config') {
      return value?.constructor?.name || '[Object]';
    }
    return value;
  }, 2);
};

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'whatsapp-webhook-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          // Remove service from meta to avoid duplication
          const { service, ...restMeta } = meta;
          return `${timestamp} [${level}]: ${message} ${
            Object.keys(restMeta).length ? safeStringify(restMeta) : ''
          }`;
        })
      ),
    }),
  ],
});

export default logger;



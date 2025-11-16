import { Pool } from 'pg';
import logger from './logger';

// Database connection pool
// Note: Database operations are optional - you can add them later
// For now, we'll just maintain a connection pool
export let pool: Pool | null = null;

export async function initializeDatabase() {
  if (!pool && process.env.DATABASE_URL) {
    try {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        allowExitOnIdle: false,
      });

      pool.on('error', (err) => {
        logger.error('Unexpected database pool error:', err);
      });

      // Test the connection
      const client = await pool.connect();
      client.release();

      logger.info('🛡️  Database connection established successfully  🛡️');
    } catch (error) {
      logger.error('‼️    Failed to initialize database connection:', error);
      throw error;
    }
  } else if (!process.env.DATABASE_URL) {
    logger.warn('DATABASE_URL not set, running without database connection');
  }
  return pool;
}

// Helper function to get database client
export async function getDbClient() {
  if (!pool) {
    await initializeDatabase();
  }
  return pool;
}

export async function closeDatabaseConnection() {
  if (pool) {
    await pool.end();
    logger.info('Database connection closed');
  }
}


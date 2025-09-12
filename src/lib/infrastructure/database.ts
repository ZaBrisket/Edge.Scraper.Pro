import { PrismaClient } from '@prisma/client';
import { createLogger } from '../logger';

const logger = createLogger('database');

// Global Prisma instance for serverless environments
declare global {
  var __prisma: PrismaClient | undefined;
}

// Prevent multiple instances in development
const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV === 'development') {
  globalThis.__prisma = prisma;
}

export { prisma };

/**
 * Gracefully disconnect from database
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database connection test failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Run database migrations (for development)
 */
export async function runMigrations(): Promise<void> {
  // This would typically be done via CLI, but can be useful for programmatic setup
  logger.info('Migrations should be run via: npx prisma migrate dev');
}

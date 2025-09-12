"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.disconnectDatabase = disconnectDatabase;
exports.testConnection = testConnection;
exports.runMigrations = runMigrations;
const client_1 = require("@prisma/client");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('database');
// Prevent multiple instances in development
const prisma = globalThis.__prisma ||
    new client_1.PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
exports.prisma = prisma;
if (process.env.NODE_ENV === 'development') {
    globalThis.__prisma = prisma;
}
/**
 * Gracefully disconnect from database
 */
async function disconnectDatabase() {
    await prisma.$disconnect();
}
/**
 * Test database connection
 */
async function testConnection() {
    try {
        await prisma.$queryRaw `SELECT 1`;
        return true;
    }
    catch (error) {
        logger.error('Database connection test failed:', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return false;
    }
}
/**
 * Run database migrations (for development)
 */
async function runMigrations() {
    // This would typically be done via CLI, but can be useful for programmatic setup
    logger.info('Migrations should be run via: npx prisma migrate dev');
}
//# sourceMappingURL=database.js.map
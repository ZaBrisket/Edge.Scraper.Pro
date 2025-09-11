import { PrismaClient } from '@prisma/client';
declare global {
    var __prisma: PrismaClient | undefined;
}
declare const prisma: PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
export { prisma };
/**
 * Gracefully disconnect from database
 */
export declare function disconnectDatabase(): Promise<void>;
/**
 * Test database connection
 */
export declare function testConnection(): Promise<boolean>;
/**
 * Run database migrations (for development)
 */
export declare function runMigrations(): Promise<void>;
//# sourceMappingURL=database.d.ts.map
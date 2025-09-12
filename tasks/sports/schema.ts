/**
 * Sports Task Schemas
 * Input and output schemas for the sports scraping task
 */

import { z } from 'zod';

// Input schema for sports task
export const SportsInputSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(1500),
  options: z.object({
    concurrency: z.number().min(1).max(20),
    delayMs: z.number().min(0).max(10000),
    timeout: z.number().min(1000).max(60000),
    maxRetries: z.number().min(0).max(5),
    extractTables: z.boolean(),
    extractBiography: z.boolean(),
    extractAchievements: z.boolean(),
    includePlaceholderData: z.boolean(),
    sportsSite: z.enum(['pro-football-reference', 'basketball-reference', 'baseball-reference', 'hockey-reference', 'auto']),
  }),
});

// Output schema for sports task
export const SportsOutputSchema = z.object({
  players: z.array(z.object({
    url: z.string(),
    name: z.string().optional(),
    position: z.string().optional(),
    team: z.string().optional(),
    stats: z.record(z.any()).optional(),
    biographical: z.record(z.any()).optional(),
    achievements: z.array(z.string()).optional(),
    rawTables: z.array(z.string()).optional(),
    metadata: z.object({
      extractedAt: z.string(),
      site: z.string(),
      confidence: z.number(),
    }),
  })),
  summary: z.object({
    total: z.number(),
    successful: z.number(),
    failed: z.number(),
    averageTime: z.number(),
    errors: z.array(z.object({
      url: z.string(),
      error: z.string(),
      category: z.string(),
    })),
  }),
  metadata: z.object({
    jobId: z.string(),
    task: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    duration: z.number(),
  }),
});

// Type exports
export type SportsInput = z.infer<typeof SportsInputSchema>;
export type SportsOutput = z.infer<typeof SportsOutputSchema>;
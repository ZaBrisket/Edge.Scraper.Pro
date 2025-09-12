/**
 * Companies Task Schemas
 * Input and output schemas for the companies scraping task
 */

import { z } from 'zod';

// Input schema for companies task
export const CompaniesInputSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(1500),
  options: z.object({
    concurrency: z.number().min(1).max(20),
    delayMs: z.number().min(0).max(10000),
    timeout: z.number().min(1000).max(60000),
    maxRetries: z.number().min(0).max(5),
    enablePaginationDiscovery: z.boolean(),
    enableUrlNormalization: z.boolean(),
    extractionDepth: z.enum(['basic', 'detailed']),
  }),
});

// Output schema for companies task
export const CompaniesOutputSchema = z.object({
  companies: z.array(z.object({
    url: z.string(),
    name: z.string().optional(),
    website: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    social: z.record(z.string()).optional(),
    techstack: z.array(z.string()).optional(),
    pages: z.array(z.object({
      url: z.string(),
      title: z.string().optional(),
    })).optional(),
    metadata: z.object({
      extractedAt: z.string(),
      confidence: z.number(),
      source: z.string(),
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
export type CompaniesInput = z.infer<typeof CompaniesInputSchema>;
export type CompaniesOutput = z.infer<typeof CompaniesOutputSchema>;
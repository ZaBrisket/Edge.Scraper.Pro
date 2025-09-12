/**
 * News Task Schemas
 * Input and output schemas for the news scraping task
 */

import { z } from 'zod';

// Input schema for news task
export const NewsInputSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(1500),
  options: z.object({
    concurrency: z.number().min(1).max(20),
    delayMs: z.number().min(0).max(10000),
    timeout: z.number().min(1000).max(60000),
    maxRetries: z.number().min(0).max(5),
    extractContent: z.boolean(),
    extractImages: z.boolean(),
    maxContentLength: z.number().min(100).max(50000),
    dateFormat: z.enum(['iso', 'timestamp', 'human']),
  }),
});

// Output schema for news task
export const NewsOutputSchema = z.object({
  articles: z.array(z.object({
    url: z.string(),
    title: z.string().optional(),
    author: z.string().optional(),
    publishedAt: z.string().optional(),
    modifiedAt: z.string().optional(),
    excerpt: z.string().optional(),
    content: z.string().optional(),
    wordCount: z.number().optional(),
    readingTime: z.number().optional(),
    tags: z.array(z.string()).optional(),
    category: z.string().optional(),
    images: z.array(z.object({
      src: z.string(),
      alt: z.string().optional(),
      caption: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    })).optional(),
    metadata: z.object({
      extractedAt: z.string(),
      confidence: z.number(),
      source: z.string(),
      language: z.string().optional(),
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
export type NewsInput = z.infer<typeof NewsInputSchema>;
export type NewsOutput = z.infer<typeof NewsOutputSchema>;
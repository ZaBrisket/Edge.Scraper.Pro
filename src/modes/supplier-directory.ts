/**
 * Supplier Directory Mode
 * Extracts company data from supplier directory pages
 */

import { z } from 'zod';
import { JSDOM } from 'jsdom';
import { ModeContract, ModeContext, UrlListSchema, BatchOutputSchema } from './types';
import { createLogger } from '../lib/logger';
import { SupplierDirectoryExtractor } from '../lib/supplier-directory-extractor';
import { BatchProcessor } from '../lib/batch-processor';

// Input schema for supplier directory mode
const SupplierDirectoryInputSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(1500),
  options: z.object({
    concurrency: z.number().min(1).max(20).optional().default(3),
    delayMs: z.number().min(0).max(10000).optional().default(1000),
    timeout: z.number().min(1000).max(60000).optional().default(30000),
    maxRetries: z.number().min(0).max(5).optional().default(3),
    enablePaginationDiscovery: z.boolean().optional().default(true),
    enableUrlNormalization: z.boolean().optional().default(true),
    extractionDepth: z.enum(['basic', 'detailed']).optional().default('basic'),
  }).optional().default({}),
});

// Output schema for supplier directory results
const SupplierDirectoryOutputSchema = BatchOutputSchema.extend({
  results: z.array(z.object({
    url: z.string(),
    success: z.boolean(),
    data: z.object({
      companies: z.array(z.object({
        name: z.string().optional(),
        website: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        metadata: z.object({
          extractedAt: z.string(),
          confidence: z.number(),
          source: z.string(),
        }).optional(),
      })).optional(),
      pagination: z.object({
        currentPage: z.number().optional(),
        totalPages: z.number().optional(),
        nextPageUrl: z.string().optional(),
        discoveredUrls: z.array(z.string()).optional(),
      }).optional(),
    }).optional(),
    error: z.string().optional(),
    category: z.string().optional(),
    responseTime: z.number().optional(),
    canonicalized: z.boolean().optional(),
    paginationDiscovered: z.boolean().optional(),
  })),
});

export class SupplierDirectoryMode implements ModeContract {
  public readonly id = 'supplier-directory';
  public readonly label = 'Supplier Directory';
  public readonly description = 'Extract company listings and contact information from supplier directory pages';
  public readonly version = '1.0.0';

  public readonly inputSchema = SupplierDirectoryInputSchema;
  public readonly outputSchema = SupplierDirectoryOutputSchema;

  public readonly uiHints = {
    inputType: 'urls' as const,
    supportsBatch: true,
    supportsProgress: true,
    estimatedTimePerUrl: 2000, // 2 seconds per URL
    maxBatchSize: 500,
    fileFormats: ['txt', 'csv'],
    placeholder: 'Enter supplier directory URLs (one per line)\nExample: https://directory.example.com/suppliers',
    helpText: 'Extracts company listings from supplier directory pages. Supports pagination discovery and URL normalization.',
    examples: [
      'https://www.d2pbuyersguide.com/filter/all/page/1',
      'https://directory.example.com/suppliers',
      'https://business-directory.com/companies',
    ],
  };

  private logger = createLogger('supplier-directory-mode');
  private extractor = new SupplierDirectoryExtractor();

  async run(input: z.infer<typeof SupplierDirectoryInputSchema>, ctx: ModeContext): Promise<any> {
    this.logger.info('Starting supplier directory extraction', {
      jobId: ctx.jobId,
      urlCount: input.urls.length,
      options: input.options,
    });

    try {
      // Create batch processor with supplier directory configuration
      const processor = new BatchProcessor({
        concurrency: input.options?.concurrency || 3,
        delayMs: input.options?.delayMs || 1000,
        timeout: input.options?.timeout || 30000,
        maxRetries: input.options?.maxRetries || 3,
        extractionMode: 'supplier-directory',
        enableUrlNormalization: input.options?.enableUrlNormalization !== false,
        enablePaginationDiscovery: input.options?.enablePaginationDiscovery !== false,
        enableStructuredLogging: true,
        correlationId: ctx.correlationId,
        onProgress: (progress) => {
          this.logger.info('Processing progress', {
            jobId: ctx.jobId,
            completed: progress.completed,
            total: progress.total,
            percentage: progress.percentage,
            errors: progress.errors,
          });
        },
      });

      // Process the batch
      const batchResult = await processor.processBatch(input.urls);

      // Transform batch result to mode output format
      const modeResult = {
        results: batchResult.results.map(result => ({
          url: result.url,
          success: result.success,
          data: result.success && result.data ? {
            companies: Array.isArray(result.data.companies) ? result.data.companies : [],
            pagination: result.data.pagination || undefined,
          } : undefined,
          error: result.error,
          category: result.category,
          responseTime: result.responseTime,
          canonicalized: result.canonicalized,
          paginationDiscovered: result.paginationDiscovered,
        })),
        summary: {
          total: batchResult.stats.totalUrls,
          successful: batchResult.stats.successfulUrls,
          failed: batchResult.stats.failedUrls,
          averageTime: batchResult.summary.averageResponseTime,
          errors: batchResult.errors.map(error => ({
            url: error.url,
            error: error.error,
            category: error.category,
          })),
        },
        metadata: {
          jobId: ctx.jobId,
          mode: this.id,
          startTime: new Date(batchResult.stats.startTime).toISOString(),
          endTime: new Date(batchResult.stats.endTime).toISOString(),
          duration: batchResult.stats.duration,
        },
      };

      this.logger.info('Supplier directory extraction completed', {
        jobId: ctx.jobId,
        totalUrls: modeResult.summary.total,
        successfulUrls: modeResult.summary.successful,
        failedUrls: modeResult.summary.failed,
        duration: modeResult.metadata.duration,
      });

      return modeResult;

    } catch (error) {
      this.logger.error('Supplier directory extraction failed', {
        jobId: ctx.jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async validate(input: any): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    // Check for empty URL list
    if (!input.urls || input.urls.length === 0) {
      errors.push('At least one URL is required');
    }

    // Validate URL formats
    if (input.urls) {
      for (let i = 0; i < input.urls.length; i++) {
        try {
          new URL(input.urls[i]);
        } catch {
          errors.push(`Invalid URL at position ${i + 1}: ${input.urls[i]}`);
        }
      }
    }

    // Check batch size limits
    if (input.urls && input.urls.length > (this.uiHints.maxBatchSize || 500)) {
      errors.push(`Too many URLs. Maximum allowed: ${this.uiHints.maxBatchSize}`);
    }

    // Validate options
    if (input.options) {
      if (input.options.concurrency && (input.options.concurrency < 1 || input.options.concurrency > 20)) {
        errors.push('Concurrency must be between 1 and 20');
      }
      if (input.options.delayMs && (input.options.delayMs < 0 || input.options.delayMs > 10000)) {
        errors.push('Delay must be between 0 and 10000 milliseconds');
      }
      if (input.options.timeout && (input.options.timeout < 1000 || input.options.timeout > 60000)) {
        errors.push('Timeout must be between 1000 and 60000 milliseconds');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async transform(output: any, input: any): Promise<any> {
    // Add any post-processing transformations here
    // For example, normalize company data, deduplicate entries, etc.
    
    if (output.results) {
      for (const result of output.results) {
        if (result.success && result.data?.companies) {
          // Normalize company names
          for (const company of result.data.companies) {
            if (company.name) {
              company.name = company.name.trim();
            }
            
            // Normalize website URLs
            if (company.website && !company.website.startsWith('http')) {
              company.website = `https://${company.website}`;
            }
            
            // Clean phone numbers
            if (company.phone) {
              company.phone = company.phone.replace(/[^\d\-\(\)\+\s]/g, '').trim();
            }
          }
        }
      }
    }

    return output;
  }
}
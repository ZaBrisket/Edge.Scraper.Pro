/**
 * Companies Task Implementation
 * Extracts company data from supplier directory pages
 */

import { ScrapeTask, TaskContext } from '../../core/types';
import { CompaniesInputSchema, CompaniesOutputSchema, CompaniesInput, CompaniesOutput } from './schema';
import { createLogger } from '../../core/log';
import { BatchProcessor } from '../../src/lib/batch-processor';
import { SupplierDirectoryExtractor } from '../../src/lib/supplier-directory-extractor';

export class CompaniesTask implements ScrapeTask<CompaniesInput, CompaniesOutput> {
  public readonly name = 'companies';
  public readonly input = CompaniesInputSchema;
  public readonly output = CompaniesOutputSchema;

  private logger = createLogger('companies-task');
  private extractor = new SupplierDirectoryExtractor();

  async run(input: CompaniesInput, ctx: TaskContext): Promise<CompaniesOutput> {
    this.logger.info('Starting companies extraction', {
      taskName: this.name,
      requestId: ctx.correlationId,
      jobId: ctx.jobId,
      urlCount: input.urls.length,
      options: input.options,
    });

    try {
      // Create batch processor with companies configuration
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
            taskName: this.name,
            requestId: ctx.correlationId,
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

      // Transform batch result to companies output format
      const companies = batchResult.results.map(result => {
        if (!result.success || !result.data) {
          return {
            url: result.url,
            name: undefined,
            website: undefined,
            email: undefined,
            phone: undefined,
            address: undefined,
            description: undefined,
            category: undefined,
            social: undefined,
            techstack: undefined,
            pages: undefined,
            metadata: {
              extractedAt: new Date().toISOString(),
              confidence: 0,
              source: result.url,
            },
          };
        }

        // Extract company data from the result
        const companyData = result.data.companies?.[0] || {};
        
        return {
          url: result.url,
          name: companyData.name,
          website: companyData.website,
          email: companyData.email,
          phone: companyData.phone,
          address: companyData.address,
          description: companyData.description,
          category: companyData.category,
          social: undefined, // Could be extracted from content
          techstack: undefined, // Could be extracted from content
          pages: result.data.pagination?.discoveredUrls?.map((url: string) => ({
            url,
            title: undefined,
          })) || [],
          metadata: {
            extractedAt: new Date().toISOString(),
            confidence: this.calculateConfidence(companyData),
            source: result.url,
          },
        };
      });

      const successful = companies.filter(c => c.name).length;
      const failed = companies.length - successful;

      const result: CompaniesOutput = {
        companies,
        summary: {
          total: batchResult.stats.totalUrls,
          successful,
          failed,
          averageTime: batchResult.summary.averageResponseTime,
          errors: batchResult.errors.map(error => ({
            url: error.url,
            error: error.error,
            category: error.category,
          })),
        },
        metadata: {
          jobId: ctx.jobId || 'unknown',
          task: this.name,
          startTime: new Date(batchResult.stats.startTime).toISOString(),
          endTime: new Date(batchResult.stats.endTime).toISOString(),
          duration: batchResult.stats.duration,
        },
      };

      this.logger.info('Companies extraction completed', {
        taskName: this.name,
        requestId: ctx.correlationId,
        jobId: ctx.jobId,
        totalUrls: result.summary.total,
        successfulUrls: result.summary.successful,
        failedUrls: result.summary.failed,
        duration: result.metadata.duration,
      });

      return result;

    } catch (error) {
      this.logger.error('Companies extraction failed', {
        taskName: this.name,
        requestId: ctx.correlationId,
        jobId: ctx.jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private calculateConfidence(companyData: any): number {
    let confidence = 0;

    if (companyData.name) confidence += 0.3;
    if (companyData.website) confidence += 0.2;
    if (companyData.email) confidence += 0.2;
    if (companyData.phone) confidence += 0.1;
    if (companyData.address) confidence += 0.1;
    if (companyData.description) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }
}
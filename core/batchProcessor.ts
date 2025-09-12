/**
 * Batch Processor
 * Simple batch processing utility for the core module
 */

import { createLogger } from './log';

export interface BatchProcessorOptions {
  concurrency?: number;
  delayMs?: number;
  timeout?: number;
  maxRetries?: number;
  onProgress?: (completed: number, total: number) => void;
  onError?: (error: Error, item: any) => void;
  onComplete?: (results: any[]) => void;
}

export class BatchProcessor<T, R> {
  private logger = createLogger('batch-processor');
  private options: Required<BatchProcessorOptions>;

  constructor(options: BatchProcessorOptions = {}) {
    this.options = {
      concurrency: 3,
      delayMs: 1000,
      timeout: 30000,
      maxRetries: 3,
      onProgress: () => {},
      onError: () => {},
      onComplete: () => {},
      ...options,
    };
  }

  async process<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];
    const errors: Array<{ item: T; error: Error; index: number }> = [];

    this.logger.info('Starting batch processing', {
      totalItems: items.length,
      concurrency: this.options.concurrency,
    });

    // Process items in batches
    for (let i = 0; i < items.length; i += this.options.concurrency) {
      const batch = items.slice(i, i + this.options.concurrency);
      
      const batchPromises = batch.map(async (item, batchIndex) => {
        const globalIndex = i + batchIndex;
        
        try {
          const result = await this.processWithRetry(item, processor, globalIndex);
          results[globalIndex] = result;
          this.options.onProgress(globalIndex + 1, items.length);
        } catch (error) {
          const errorInfo = {
            item,
            error: error as Error,
            index: globalIndex,
          };
          errors.push(errorInfo);
          this.options.onError(error as Error, item);
        }
      });

      await Promise.all(batchPromises);

      // Add delay between batches
      if (i + this.options.concurrency < items.length) {
        await this.delay(this.options.delayMs);
      }
    }

    this.logger.info('Batch processing completed', {
      totalItems: items.length,
      successful: results.length,
      errors: errors.length,
    });

    this.options.onComplete(results);
    return results;
  }

  private async processWithRetry<T, R>(
    item: T,
    processor: (item: T, index: number) => Promise<R>,
    index: number
  ): Promise<R> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await processor(item, index);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.options.maxRetries) {
          this.logger.warn('Retrying item processing', {
            item,
            attempt: attempt + 1,
            maxRetries: this.options.maxRetries,
            error: lastError.message,
          });
          
          await this.delay(1000 * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }

    throw lastError || new Error('Processing failed after all retries');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Factory function
export function createBatchProcessor<T, R>(options?: BatchProcessorOptions): BatchProcessor<T, R> {
  return new BatchProcessor<T, R>(options);
}
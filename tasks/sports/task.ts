/**
 * Sports Task Implementation
 * Extracts player statistics and biographical data from sports reference sites
 */

import { ScrapeTask, TaskContext } from '../../core/types';
import { SportsInputSchema, SportsOutputSchema, SportsInput, SportsOutput } from './schema';
import { createLogger } from '../../core/log';
import { BatchProcessor } from '../../src/lib/batch-processor';
import { SportsContentExtractor } from '../../src/lib/sports-extractor';

export class SportsTask implements ScrapeTask<SportsInput, SportsOutput> {
  public readonly name = 'sports';
  public readonly input = SportsInputSchema;
  public readonly output = SportsOutputSchema;

  private logger = createLogger('sports-task');
  private extractor = new SportsContentExtractor();

  async run(input: SportsInput, ctx: TaskContext): Promise<SportsOutput> {
    this.logger.info('Starting sports extraction', {
      taskName: this.name,
      requestId: ctx.correlationId,
      jobId: ctx.jobId,
      urlCount: input.urls.length,
      options: input.options,
    });

    try {
      // Create batch processor with sports configuration
      const processor = new BatchProcessor({
        concurrency: input.options?.concurrency || 2,
        delayMs: input.options?.delayMs || 2000,
        timeout: input.options?.timeout || 30000,
        maxRetries: input.options?.maxRetries || 3,
        extractionMode: 'sports',
        enableUrlNormalization: true,
        enablePaginationDiscovery: false,
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

      // Transform batch result to sports output format
      const players = batchResult.results.map(result => {
        if (!result.success || !result.data) {
          return {
            url: result.url,
            name: undefined,
            position: undefined,
            team: undefined,
            stats: undefined,
            biographical: undefined,
            achievements: undefined,
            rawTables: undefined,
            metadata: {
              extractedAt: new Date().toISOString(),
              site: this.extractSiteFromUrl(result.url),
              confidence: 0,
            },
          };
        }

        return {
          url: result.url,
          name: result.data.playerName,
          position: result.data.position,
          team: result.data.team,
          stats: input.options?.extractTables !== false ? result.data.statistics : undefined,
          biographical: input.options?.extractBiography !== false ? result.data.biographical : undefined,
          achievements: input.options?.extractAchievements !== false ? result.data.achievements : undefined,
          rawTables: input.options?.extractTables !== false ? result.data.rawTables : undefined,
          metadata: {
            extractedAt: new Date().toISOString(),
            site: this.extractSiteFromUrl(result.url),
            confidence: this.calculateConfidence(result.data),
          },
        };
      });

      const successful = players.filter(p => p.name).length;
      const failed = players.length - successful;

      const result: SportsOutput = {
        players,
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

      this.logger.info('Sports extraction completed', {
        taskName: this.name,
        requestId: ctx.correlationId,
        jobId: ctx.jobId,
        totalUrls: result.summary.total,
        successfulUrls: result.summary.successful,
        failedUrls: result.summary.failed,
        duration: result.metadata.duration,
        playersExtracted: successful,
      });

      return result;

    } catch (error) {
      this.logger.error('Sports extraction failed', {
        taskName: this.name,
        requestId: ctx.correlationId,
        jobId: ctx.jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private extractSiteFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  private calculateConfidence(playerData: any): number {
    let confidence = 0;

    if (playerData.playerName) confidence += 0.4;
    if (playerData.position) confidence += 0.2;
    if (playerData.team) confidence += 0.2;
    if (playerData.statistics && Object.keys(playerData.statistics).length > 0) confidence += 0.2;

    return Math.min(confidence, 1.0);
  }
}
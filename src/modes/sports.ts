/**
 * Sports Mode
 * Extracts player statistics and biographical data from sports reference sites
 */

import { z } from 'zod';
import { JSDOM } from 'jsdom';
import { ModeContract, ModeContext, UrlListSchema, BatchOutputSchema } from './types';
import { createLogger } from '../lib/logger';
import { SportsContentExtractor } from '../lib/sports-extractor';
import { BatchProcessor } from '../lib/batch-processor';

// Input schema for sports mode
const SportsInputSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(1500),
  options: z
    .object({
      concurrency: z.number().min(1).max(20).optional().default(2),
      delayMs: z.number().min(0).max(10000).optional().default(2000),
      timeout: z.number().min(1000).max(60000).optional().default(30000),
      maxRetries: z.number().min(0).max(5).optional().default(3),
      extractTables: z.boolean().optional().default(true),
      extractBiography: z.boolean().optional().default(true),
      extractAchievements: z.boolean().optional().default(true),
      includePlaceholderData: z.boolean().optional().default(false),
      sportsSite: z
        .enum([
          'pro-football-reference',
          'basketball-reference',
          'baseball-reference',
          'hockey-reference',
          'auto',
        ])
        .optional()
        .default('auto'),
    })
    .optional()
    .default({}),
});

// Output schema for sports results
const SportsOutputSchema = BatchOutputSchema.extend({
  results: z.array(
    z.object({
      url: z.string(),
      success: z.boolean(),
      data: z
        .object({
          playerName: z.string().optional(),
          position: z.string().optional(),
          team: z.string().optional(),
          statistics: z.record(z.any()).optional(),
          biographical: z.record(z.any()).optional(),
          achievements: z.array(z.string()).optional(),
          rawTables: z.array(z.string()).optional(),
          metadata: z.object({
            url: z.string(),
            extractedAt: z.string(),
            site: z.string(),
            confidence: z.number(),
          }),
        })
        .optional(),
      error: z.string().optional(),
      category: z.string().optional(),
      responseTime: z.number().optional(),
      canonicalized: z.boolean().optional(),
    })
  ),
});

export class SportsMode implements ModeContract {
  public readonly id = 'sports';
  public readonly label = 'Sports Statistics';
  public readonly description =
    'Extract player statistics, biographical data, and achievements from sports reference sites';
  public readonly version = '1.0.0';

  public readonly inputSchema = SportsInputSchema;
  public readonly outputSchema = SportsOutputSchema;

  public readonly uiHints = {
    inputType: 'urls' as const,
    supportsBatch: true,
    supportsProgress: true,
    estimatedTimePerUrl: 3000, // 3 seconds per URL (sports pages are complex)
    maxBatchSize: 200,
    fileFormats: ['txt', 'csv'],
    placeholder:
      'Enter sports player URLs (one per line)\nExample: https://www.pro-football-reference.com/players/M/MahoPa00.htm',
    helpText:
      'Extracts player statistics, biographical information, and career achievements from Pro Football Reference and other sports sites.',
    examples: [
      'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
      'https://www.pro-football-reference.com/players/B/BradTo00.htm',
      'https://www.basketball-reference.com/players/j/jamesle01.html',
      'https://www.baseball-reference.com/players/t/troutmi01.shtml',
    ],
  };

  private logger = createLogger('sports-mode');
  private extractor = new SportsContentExtractor();

  async run(input: z.infer<typeof SportsInputSchema>, ctx: ModeContext): Promise<any> {
    this.logger.info('Starting sports data extraction', {
      jobId: ctx.jobId,
      urlCount: input.urls.length,
      options: input.options,
    });

    try {
      // Create batch processor with sports configuration
      const processor = new BatchProcessor({
        concurrency: input.options?.concurrency || 2, // Conservative for sports sites
        delayMs: input.options?.delayMs || 2000, // Respectful delay for sports sites
        timeout: input.options?.timeout || 30000,
        maxRetries: input.options?.maxRetries || 3,
        extractionMode: 'sports',
        enableUrlNormalization: true,
        enablePaginationDiscovery: false, // Not relevant for individual player pages
        enableStructuredLogging: true,
        correlationId: ctx.correlationId,
        onProgress: progress => {
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
          data:
            result.success && result.data
              ? {
                  playerName: result.data.playerName,
                  position: result.data.position,
                  team: result.data.team,
                  statistics:
                    input.options?.extractTables !== false ? result.data.statistics : undefined,
                  biographical:
                    input.options?.extractBiography !== false
                      ? result.data.biographical
                      : undefined,
                  achievements:
                    input.options?.extractAchievements !== false
                      ? result.data.achievements
                      : undefined,
                  rawTables:
                    input.options?.extractTables !== false ? result.data.rawTables : undefined,
                  metadata: result.data.metadata || {
                    url: result.url,
                    extractedAt: new Date().toISOString(),
                    site: this.extractSiteFromUrl(result.url),
                    confidence: 0,
                  },
                }
              : undefined,
          error: result.error,
          category: result.category,
          responseTime: result.responseTime,
          canonicalized: result.canonicalized,
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

      this.logger.info('Sports data extraction completed', {
        jobId: ctx.jobId,
        totalUrls: modeResult.summary.total,
        successfulUrls: modeResult.summary.successful,
        failedUrls: modeResult.summary.failed,
        duration: modeResult.metadata.duration,
        playersExtracted: modeResult.results.filter(r => r.success && r.data?.playerName).length,
      });

      return modeResult;
    } catch (error) {
      this.logger.error('Sports data extraction failed', {
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

  async validate(input: any): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    // Check for empty URL list
    if (!input.urls || input.urls.length === 0) {
      errors.push('At least one URL is required');
    }

    // Validate URL formats and check for sports sites
    if (input.urls) {
      const supportedDomains = [
        'pro-football-reference.com',
        'basketball-reference.com',
        'baseball-reference.com',
        'hockey-reference.com',
        'sports-reference.com',
      ];

      for (let i = 0; i < input.urls.length; i++) {
        try {
          const url = new URL(input.urls[i]);
          const domain = url.hostname.replace('www.', '');

          // Warn about unsupported domains but don't fail validation
          if (!supportedDomains.includes(domain)) {
            this.logger.warn('Unsupported sports domain', {
              url: input.urls[i],
              domain,
              supportedDomains,
            });
          }
        } catch {
          errors.push(`Invalid URL at position ${i + 1}: ${input.urls[i]}`);
        }
      }
    }

    // Check batch size limits (sports sites are resource-intensive)
    if (input.urls && input.urls.length > (this.uiHints.maxBatchSize || 200)) {
      errors.push(`Too many URLs. Maximum allowed for sports mode: ${this.uiHints.maxBatchSize}`);
    }

    // Validate options
    if (input.options) {
      if (
        input.options.concurrency &&
        (input.options.concurrency < 1 || input.options.concurrency > 5)
      ) {
        errors.push('Concurrency for sports mode must be between 1 and 5 (to respect site limits)');
      }
      if (input.options.delayMs && input.options.delayMs < 1000) {
        errors.push('Delay for sports mode must be at least 1000ms (to respect site limits)');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async transform(output: any, input: any): Promise<any> {
    // Add any post-processing transformations here

    if (output.results) {
      for (const result of output.results) {
        if (result.success && result.data) {
          // Normalize player names
          if (result.data.playerName) {
            result.data.playerName = this.normalizePlayerName(result.data.playerName);
          }

          // Standardize positions
          if (result.data.position) {
            result.data.position = this.normalizePosition(result.data.position);
          }

          // Clean team names
          if (result.data.team) {
            result.data.team = this.normalizeTeamName(result.data.team);
          }

          // Process statistics for better structure
          if (result.data.statistics) {
            result.data.statistics = this.normalizeStatistics(result.data.statistics);
          }
        }
      }
    }

    return output;
  }

  private normalizePlayerName(name: string): string {
    // Remove extra whitespace and standardize format
    return name.trim().replace(/\s+/g, ' ');
  }

  private normalizePosition(position: string): string {
    // Standardize common position abbreviations
    const positionMap: Record<string, string> = {
      QB: 'Quarterback',
      RB: 'Running Back',
      FB: 'Fullback',
      WR: 'Wide Receiver',
      TE: 'Tight End',
      OL: 'Offensive Line',
      C: 'Center',
      G: 'Guard',
      T: 'Tackle',
      DL: 'Defensive Line',
      DE: 'Defensive End',
      DT: 'Defensive Tackle',
      LB: 'Linebacker',
      CB: 'Cornerback',
      S: 'Safety',
      FS: 'Free Safety',
      SS: 'Strong Safety',
      K: 'Kicker',
      P: 'Punter',
      LS: 'Long Snapper',
    };

    const normalized = position.trim().toUpperCase();
    return positionMap[normalized] || position.trim();
  }

  private normalizeTeamName(team: string): string {
    // Remove extra whitespace and common suffixes
    return team
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\s*\(.*?\)$/, '') // Remove parenthetical info
      .trim();
  }

  private normalizeStatistics(statistics: Record<string, any>): Record<string, any> {
    // Clean up statistics object structure
    const normalized: Record<string, any> = {};

    for (const [key, value] of Object.entries(statistics)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Process nested statistics tables
        const cleanedTable: Record<string, any> = {};
        for (const [statKey, statValue] of Object.entries(value)) {
          if (statValue && typeof statValue === 'string') {
            // Try to convert numeric strings to numbers
            const numValue = parseFloat(statValue);
            cleanedTable[statKey] = !isNaN(numValue) ? numValue : statValue;
          } else {
            cleanedTable[statKey] = statValue;
          }
        }
        normalized[key] = cleanedTable;
      } else {
        normalized[key] = value;
      }
    }

    return normalized;
  }
}

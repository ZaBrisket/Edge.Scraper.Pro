/**
 * CLI Adapter for Mode Registry
 * Bridges the existing CLI interface with the new mode registry system
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../lib/logger';
import { modeRegistry } from './registry';
import { ModeContext } from './types';
import { BatchProcessor } from '../lib/batch-processor';

export interface CLIModeOptions {
  urls: string;
  mode: string;
  output: string;
  concurrency: number;
  delay: number;
  timeout: number;
  verbose: boolean;
}

export class CLIModeAdapter {
  private logger = createLogger('cli-adapter');

  constructor() {
    // Initialize modes will be done in Phase 2
  }

  /**
   * Execute a mode via CLI interface
   */
  async executeCLIMode(options: CLIModeOptions): Promise<void> {
    try {
      this.logger.info('Starting CLI mode execution', {
        mode: options.mode,
        urlsFile: options.urls,
        output: options.output,
      });

      // Read URLs from file
      const urlsPath = path.resolve(options.urls);
      if (!fs.existsSync(urlsPath)) {
        throw new Error(`URLs file not found: ${urlsPath}`);
      }

      const urlsContent = fs.readFileSync(urlsPath, 'utf8');
      const urls = urlsContent
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0 && !url.startsWith('#'));

      if (urls.length === 0) {
        throw new Error('No URLs found in file');
      }

      this.logger.info(`Found ${urls.length} URLs to process`);

      // Check if mode is registered in the new registry
      if (modeRegistry.hasMode(options.mode)) {
        await this.executeWithModeRegistry(options, urls);
      } else {
        // Fall back to legacy batch processor for backward compatibility
        await this.executeWithLegacyProcessor(options, urls);
      }

    } catch (error) {
      this.logger.error('CLI mode execution failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        mode: options.mode,
      });
      throw error;
    }
  }

  /**
   * Execute using the new mode registry
   */
  private async executeWithModeRegistry(
    options: CLIModeOptions,
    urls: string[]
  ): Promise<void> {
    const mode = modeRegistry.getMode(options.mode);
    
    this.logger.info('Executing with mode registry', {
      modeId: mode.id,
      modeLabel: mode.label,
      urlCount: urls.length,
    });

    // Prepare input according to mode's input schema
    const input = {
      urls,
      options: {
        concurrency: options.concurrency,
        delayMs: options.delay,
        timeout: options.timeout,
        maxRetries: 3,
      },
    };

    // Create mode context
    const context: ModeContext = {
      jobId: `cli-${Date.now()}`,
      correlationId: `cli-${Date.now()}`,
      logger: this.logger,
      httpClient: null, // Will be provided by the mode
      structuredLogger: null,
    };

    const startTime = Date.now();
    const result = await modeRegistry.execute(mode.id, input, context);
    const duration = Date.now() - startTime;

    // Save results
    await this.saveResults(options.output, result);

    this.logger.info('Mode execution completed', {
      modeId: mode.id,
      duration: Math.round(duration / 1000),
      outputFile: options.output,
    });
  }

  /**
   * Execute using legacy batch processor for backward compatibility
   */
  private async executeWithLegacyProcessor(
    options: CLIModeOptions,
    urls: string[]
  ): Promise<void> {
    this.logger.info('Executing with legacy batch processor', {
      mode: options.mode,
      urlCount: urls.length,
    });

    // Create batch processor with legacy mode
    const processor = new BatchProcessor({
      concurrency: options.concurrency,
      delayMs: options.delay,
      timeout: options.timeout,
      extractionMode: options.mode as 'sports' | 'supplier-directory' | 'general',
      onProgress: (progress) => {
        if (options.verbose) {
          this.logger.info(`Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)`, {
            completed: progress.completed,
            total: progress.total,
            percentage: progress.percentage,
            errors: progress.errors,
          });
        }
      },
    });

    const result = await processor.processBatch(urls);

    // Save results in legacy format
    await this.saveResults(options.output, result);

    this.logger.info('Legacy processing completed', {
      totalUrls: result.stats.totalUrls,
      successfulUrls: result.stats.successfulUrls,
      failedUrls: result.stats.failedUrls,
      duration: Math.round(result.stats.duration / 1000),
    });
  }

  /**
   * Save results to output file
   */
  private async saveResults(outputPath: string, result: any): Promise<void> {
    const resolvedPath = path.resolve(outputPath);
    const outputDir = path.dirname(resolvedPath);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Determine format from extension
    const ext = path.extname(resolvedPath).toLowerCase();
    
    if (ext === '.json') {
      fs.writeFileSync(resolvedPath, JSON.stringify(result, null, 2));
    } else {
      // Default to JSON
      fs.writeFileSync(resolvedPath, JSON.stringify(result, null, 2));
    }

    this.logger.info('Results saved', { outputPath: resolvedPath });
  }

  /**
   * List available modes for CLI help
   */
  listAvailableModes(): Array<{
    id: string;
    label: string;
    description?: string;
  }> {
    const registryModes = modeRegistry.listModes()
      .filter(mode => mode.enabled)
      .map(mode => ({
        id: mode.id,
        label: mode.label,
        description: mode.description,
      }));

    // Add legacy modes for backward compatibility
    const legacyModes = [
      {
        id: 'supplier-directory',
        label: 'Supplier Directory',
        description: 'Extract company data from supplier directory pages',
      },
      {
        id: 'sports',
        label: 'Sports Statistics',
        description: 'Extract player statistics from sports reference sites',
      },
      {
        id: 'general',
        label: 'General Content',
        description: 'Basic content extraction without specialized processing',
      },
    ];

    // Merge and deduplicate
    const allModes = [...registryModes];
    for (const legacyMode of legacyModes) {
      if (!allModes.some(mode => mode.id === legacyMode.id)) {
        allModes.push(legacyMode);
      }
    }

    return allModes;
  }
}

export const cliModeAdapter = new CLIModeAdapter();
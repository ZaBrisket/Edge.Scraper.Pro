/**
 * Start Scraping Job API Endpoint
 * POST /api/scrape/start
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { createLogger } from '../../../src/lib/logger';
import { modeRegistry } from '../../../src/modes/registry';
import { initializeModes } from '../../../src/modes/index';

// Initialize modes on startup
let modesInitialized = false;
if (!modesInitialized) {
  try {
    initializeModes();
    modesInitialized = true;
  } catch (error) {
    console.error('Failed to initialize modes:', error);
  }
}

const logger = createLogger('api-scrape-start');

// In-memory job storage (in production, use Redis or database)
const jobs = new Map<string, any>();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { mode, input } = req.body;

    if (!mode || !input) {
      return res.status(400).json({ error: 'Mode and input are required' });
    }

    // Validate that mode exists
    if (!modeRegistry.hasMode(mode)) {
      return res.status(400).json({ error: `Unknown mode: ${mode}` });
    }

    // Create immutable snapshot of input to prevent URLs from disappearing
    const immutableInput = JSON.parse(JSON.stringify(input));
    immutableInput.metadata = {
      submittedAt: new Date().toISOString(),
      originalUrlCount: input.urls?.length || 0,
      jobId: randomUUID(),
    };

    // Create separate deep copy for original input preservation
    const originalInputSnapshot = JSON.parse(JSON.stringify(immutableInput));

    // Create job
    const jobId = immutableInput.metadata.jobId;
    const job = {
      id: jobId,
      mode,
      input: immutableInput, // Working copy for processing
      originalInput: originalInputSnapshot, // Immutable snapshot for preservation
      status: 'pending',
      progress: {
        completed: 0,
        total: input.urls?.length || 0,
        percentage: 0,
        errors: 0,
      },
      result: null,
      error: null,
      startTime: new Date().toISOString(),
      endTime: null,
    };

    jobs.set(jobId, job);

    logger.info('Job created', {
      jobId,
      mode,
      urlCount: input.urls?.length || 0,
    });

    // Start job processing asynchronously
    processJobAsync(jobId, mode, input).catch(error => {
      logger.error('Job processing failed', {
        jobId,
        error: error.message,
      });
      
      const failedJob = jobs.get(jobId);
      if (failedJob) {
        failedJob.status = 'failed';
        failedJob.error = error.message;
        failedJob.endTime = new Date().toISOString();
        jobs.set(jobId, failedJob);
      }
    });

    res.status(200).json({ jobId });

  } catch (error) {
    logger.error('Start job API error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function processJobAsync(jobId: string, mode: string, input: any) {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  try {
    // Update job status
    job.status = 'running';
    jobs.set(jobId, job);

    logger.info('Starting job processing', { jobId, mode });

    // Create mode context
    const context = {
      jobId,
      correlationId: jobId,
      logger,
      httpClient: null, // Will be provided by the mode
      structuredLogger: null,
    };

    // Execute mode with immutable input
    const result = await modeRegistry.execute(mode, job.input, context);

    // Enhance result with source URL preservation
    const enhancedResult = {
      ...result,
      sourceInput: {
        urls: job.originalInput.urls,
        options: job.originalInput.options,
        submittedAt: job.originalInput.metadata.submittedAt,
        originalCount: job.originalInput.metadata.originalUrlCount,
      },
      urlPreservation: {
        sourceUrls: job.originalInput.urls,
        processedUrls: result.results?.map((r: any) => r.url) || [],
        discoveredUrls: result.results?.filter((r: any) => 
          r.paginationDiscovered && !job.originalInput.urls.includes(r.url)
        ).map((r: any) => r.url) || [],
      },
    };

    // Update job with enhanced results
    job.status = 'completed';
    job.result = enhancedResult;
    job.endTime = new Date().toISOString();
    job.progress = {
      completed: result.summary?.total || 0,
      total: result.summary?.total || 0,
      percentage: 100,
      errors: result.summary?.failed || 0,
    };

    jobs.set(jobId, job);

    logger.info('Job completed successfully', {
      jobId,
      duration: Date.now() - new Date(job.startTime).getTime(),
      successful: result.summary?.successful || 0,
      failed: result.summary?.failed || 0,
    });

  } catch (error) {
    logger.error('Job execution failed', {
      jobId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Unknown error';
    job.endTime = new Date().toISOString();
    jobs.set(jobId, job);

    throw error;
  }
}

// Export jobs map for other API routes
export { jobs };
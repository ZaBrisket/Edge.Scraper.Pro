/**
 * API Dispatcher
 * HTTP API layer for task execution
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { taskDispatcher, TaskContext } from '../core/dispatcher';
import { createLogger } from '../core/log';
import { createRateLimiter } from '../core/rateLimit';
import { createStorage } from '../core/storage';
import { envConfig } from '../core/config';

// Initialize core services
const logger = createLogger('api-dispatcher');
const rateLimiter = createRateLimiter(envConfig.get('rateLimit'));
const storage = createStorage(envConfig.get('storage'));

// In-memory job storage (in production, use Redis or database)
const jobs = new Map<string, any>();

export interface JobRequest {
  taskName: string;
  input: any;
}

export interface JobResponse {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  progress?: {
    completed: number;
    total: number;
    percentage: number;
    errors: number;
  };
}

export async function startJob(req: JobRequest): Promise<{ jobId: string }> {
  const { taskName, input } = req;

  // Validate task exists
  if (!taskDispatcher.hasTask(taskName)) {
    throw new Error(`Unknown task: ${taskName}`);
  }

  // Create job
  const jobId = randomUUID();
  const job = {
    id: jobId,
    taskName,
    input,
    status: 'pending' as const,
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
    taskName,
    urlCount: input.urls?.length || 0,
  });

  // Start job processing asynchronously
  processJobAsync(jobId, taskName, input).catch(error => {
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

  return { jobId };
}

export async function getJobStatus(jobId: string): Promise<JobResponse> {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  return {
    jobId: job.id,
    status: job.status,
    result: job.result,
    error: job.error,
    progress: job.progress,
  };
}

export async function cancelJob(jobId: string): Promise<{ success: boolean }> {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  if (job.status === 'completed' || job.status === 'failed') {
    return { success: false };
  }

  job.status = 'failed';
  job.error = 'Job cancelled by user';
  job.endTime = new Date().toISOString();
  jobs.set(jobId, job);

  return { success: true };
}

async function processJobAsync(jobId: string, taskName: string, input: any) {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  try {
    // Update job status
    job.status = 'running';
    jobs.set(jobId, job);

    logger.info('Starting job processing', { jobId, taskName });

    // Create task context
    const context: TaskContext = {
      http: null, // Will be provided by the task
      storage,
      logger,
      rateLimiter,
      config: envConfig.getAll(),
      jobId,
      correlationId: jobId,
    };

    // Execute task
    const result = await taskDispatcher.execute(taskName, input, context);

    // Update job with results
    job.status = 'completed';
    job.result = result;
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
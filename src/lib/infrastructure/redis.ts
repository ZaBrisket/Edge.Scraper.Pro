import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = new Redis({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export interface QueueJob {
  id: string;
  type: string;
  payload: any;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  processAt: number;
}

/**
 * Enqueue a job for processing
 */
export async function enqueueJob(
  queueName: string,
  jobType: string,
  payload: any,
  options: {
    delay?: number; // milliseconds
    maxAttempts?: number;
    jobId?: string;
  } = {},
): Promise<string> {
  const jobId = options.jobId || `${jobType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = Date.now();
  
  const job: QueueJob = {
    id: jobId,
    type: jobType,
    payload,
    attempts: 0,
    maxAttempts: options.maxAttempts || 3,
    createdAt: now,
    processAt: now + (options.delay || 0),
  };

  // Add job to the queue (sorted set by processAt timestamp)
  await redis.zadd(queueName, { score: job.processAt, member: JSON.stringify(job) });
  
  // Track job by ID for status queries
  await redis.hset(`job:${jobId}`, {
    status: 'queued',
    queueName,
    createdAt: now,
    payload: JSON.stringify(payload),
  });

  return jobId;
}

/**
 * Dequeue the next available job
 */
export async function dequeueJob(
  queueName: string,
  visibilityTimeout: number = 300, // 5 minutes default
): Promise<QueueJob | null> {
  const now = Date.now();
  
  // Get jobs that are ready to process (processAt <= now)
  const jobs = await redis.zrangebyscore(queueName, 0, now, { count: 1 });
  
  if (!jobs || jobs.length === 0) {
    return null;
  }

  const jobData = jobs[0];
  const job: QueueJob = JSON.parse(jobData);

  // Remove from queue and add to processing set with visibility timeout
  const pipeline = redis.pipeline();
  pipeline.zrem(queueName, jobData);
  pipeline.zadd(
    `${queueName}:processing`,
    { score: now + visibilityTimeout * 1000, member: jobData },
  );
  await pipeline.exec();

  // Update job status
  await redis.hset(`job:${job.id}`, {
    status: 'processing',
    startedAt: now,
  });

  return job;
}

/**
 * Mark a job as completed
 */
export async function completeJob(queueName: string, job: QueueJob): Promise<void> {
  const now = Date.now();
  
  // Remove from processing set
  await redis.zrem(`${queueName}:processing`, JSON.stringify(job));
  
  // Update job status
  await redis.hset(`job:${job.id}`, {
    status: 'completed',
    completedAt: now,
  });
}

/**
 * Mark a job as failed and potentially retry
 */
export async function failJob(
  queueName: string,
  job: QueueJob,
  error: string,
  retryDelay: number = 60000, // 1 minute default
): Promise<void> {
  const now = Date.now();
  
  // Remove from processing set
  await redis.zrem(`${queueName}:processing`, JSON.stringify(job));
  
  job.attempts++;
  
  if (job.attempts < job.maxAttempts) {
    // Retry with exponential backoff
    const backoffDelay = retryDelay * Math.pow(2, job.attempts - 1);
    job.processAt = now + backoffDelay;
    
    // Re-enqueue for retry
    await redis.zadd(queueName, { score: job.processAt, member: JSON.stringify(job) });
    
    await redis.hset(`job:${job.id}`, {
      status: 'retrying',
      attempts: job.attempts,
      lastError: error,
      nextRetryAt: job.processAt,
    });
  } else {
    // Max attempts reached, mark as failed
    await redis.hset(`job:${job.id}`, {
      status: 'failed',
      attempts: job.attempts,
      failedAt: now,
      lastError: error,
    });
  }
}

/**
 * Get job status by ID
 */
export async function getJobStatus(jobId: string): Promise<any> {
  return await redis.hgetall(`job:${jobId}`);
}

/**
 * Clean up expired jobs from processing queue (visibility timeout exceeded)
 */
export async function cleanupExpiredJobs(queueName: string): Promise<number> {
  const now = Date.now();
  
  // Get expired jobs from processing queue
  const expiredJobs = await redis.zrangebyscore(`${queueName}:processing`, 0, now);
  
  if (!expiredJobs || expiredJobs.length === 0) {
    return 0;
  }

  // Move expired jobs back to main queue
  const pipeline = redis.pipeline();
  
  for (const jobData of expiredJobs) {
    const job: QueueJob = JSON.parse(jobData);
    
    // Remove from processing
    pipeline.zrem(`${queueName}:processing`, jobData);
    
    // Add back to main queue with current timestamp
    job.processAt = now;
    pipeline.zadd(queueName, { score: job.processAt, member: JSON.stringify(job) });
    
    // Update job status
    pipeline.hset(`job:${job.id}`, {
      status: 'queued',
      retriedAt: now,
    });
  }
  
  await pipeline.exec();
  
  return expiredJobs.length;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queueName: string): Promise<{
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const [queued, processing] = await Promise.all([
    redis.zcard(queueName),
    redis.zcard(`${queueName}:processing`),
  ]);

  // For completed/failed, we'd need to scan job keys or maintain counters
  // Simplified version for now
  return {
    queued: queued || 0,
    processing: processing || 0,
    completed: 0,
    failed: 0,
  };
}

export { redis };
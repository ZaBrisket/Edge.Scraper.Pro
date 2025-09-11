const { Redis } = require('@upstash/redis');

// Initialize Redis client
const redis = new Redis({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * Enqueue a job for processing
 */
async function enqueueJob(queueName, jobType, payload, options = {}) {
  const jobId = options.jobId || `${jobType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = Date.now();
  
  const job = {
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
 * Get job status by ID
 */
async function getJobStatus(jobId) {
  return await redis.hgetall(`job:${jobId}`);
}

module.exports = {
  enqueueJob,
  getJobStatus,
  redis,
};
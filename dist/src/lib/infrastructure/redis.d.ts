import { Redis } from '@upstash/redis';
declare const redis: Redis;
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
export declare function enqueueJob(queueName: string, jobType: string, payload: any, options?: {
    delay?: number;
    maxAttempts?: number;
    jobId?: string;
}): Promise<string>;
/**
 * Dequeue the next available job
 */
export declare function dequeueJob(queueName: string, visibilityTimeout?: number): Promise<QueueJob | null>;
/**
 * Mark a job as completed
 */
export declare function completeJob(queueName: string, job: QueueJob): Promise<void>;
/**
 * Mark a job as failed and potentially retry
 */
export declare function failJob(queueName: string, job: QueueJob, error: string, retryDelay?: number): Promise<void>;
/**
 * Get job status by ID
 */
export declare function getJobStatus(jobId: string): Promise<any>;
/**
 * Clean up expired jobs from processing queue (visibility timeout exceeded)
 */
export declare function cleanupExpiredJobs(queueName: string): Promise<number>;
/**
 * Get queue statistics
 */
export declare function getQueueStats(queueName: string): Promise<{
    queued: number;
    processing: number;
    completed: number;
    failed: number;
}>;
export { redis };
//# sourceMappingURL=redis.d.ts.map
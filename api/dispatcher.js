"use strict";
/**
 * API Dispatcher
 * HTTP API layer for task execution
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobs = void 0;
exports.startJob = startJob;
exports.getJobStatus = getJobStatus;
exports.cancelJob = cancelJob;
const crypto_1 = require("crypto");
const dispatcher_1 = require("../core/dispatcher");
const log_1 = require("../core/log");
const rateLimit_1 = require("../core/rateLimit");
const storage_1 = require("../core/storage");
const config_1 = require("../core/config");
// Initialize core services
const logger = (0, log_1.createLogger)('api-dispatcher');
const rateLimiter = (0, rateLimit_1.createRateLimiter)(config_1.envConfig.get('rateLimit'));
const storage = (0, storage_1.createStorage)(config_1.envConfig.get('storage'));
// In-memory job storage (in production, use Redis or database)
const jobs = new Map();
exports.jobs = jobs;
async function startJob(req) {
    const { taskName, input } = req;
    // Validate task exists
    if (!dispatcher_1.taskDispatcher.hasTask(taskName)) {
        throw new Error(`Unknown task: ${taskName}`);
    }
    // Create job
    const jobId = (0, crypto_1.randomUUID)();
    const job = {
        id: jobId,
        taskName,
        input,
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
async function getJobStatus(jobId) {
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
async function cancelJob(jobId) {
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
async function processJobAsync(jobId, taskName, input) {
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
        const context = {
            http: null, // Will be provided by the task
            storage,
            logger,
            rateLimiter,
            config: config_1.envConfig.getAll(),
            jobId,
            correlationId: jobId,
        };
        // Execute task
        const result = await dispatcher_1.taskDispatcher.execute(taskName, input, context);
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
    }
    catch (error) {
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
//# sourceMappingURL=dispatcher.js.map
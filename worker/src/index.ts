import { PrismaClient } from '@prisma/client';
import { dequeueJob, completeJob, failJob, cleanupExpiredJobs } from '../../src/lib/infrastructure/redis';
import { ExcelExporter } from './exporters/excel';
import { PDFExporter } from './exporters/pdf';
import { createLogger } from './utils/logger';

const prisma = new PrismaClient();
const logger = createLogger('worker');

const QUEUE_NAME = 'export-jobs';
const POLL_INTERVAL = 5000; // 5 seconds
const VISIBILITY_TIMEOUT = 300; // 5 minutes

class ExportWorker {
  private running = false;
  private excelExporter = new ExcelExporter();
  private pdfExporter = new PDFExporter();

  async start() {
    this.running = true;
    logger.info('Export worker started');

    // Main processing loop
    while (this.running) {
      try {
        await this.processJobs();
        await this.cleanup();
        await this.sleep(POLL_INTERVAL);
      } catch (error) {
        logger.error('Worker error:', error);
        await this.sleep(POLL_INTERVAL);
      }
    }
  }

  async stop() {
    this.running = false;
    await prisma.$disconnect();
    logger.info('Export worker stopped');
  }

  private async processJobs() {
    const job = await dequeueJob(QUEUE_NAME, VISIBILITY_TIMEOUT);
    
    if (!job) {
      return; // No jobs available
    }

    logger.info(`Processing job ${job.id} (${job.type})`);

    try {
      // Update job status to processing
      await prisma.job.update({
        where: { id: job.payload.jobId },
        data: {
          status: 'processing',
          startedAt: new Date(),
        },
      });

      // Log job start
      await prisma.jobLog.create({
        data: {
          jobId: job.payload.jobId,
          level: 'info',
          message: 'Job processing started',
          metadata: { workerId: process.env.WORKER_ID || 'unknown' },
        },
      });

      // Process based on format
      let result;
      if (job.payload.format === 'xlsx') {
        result = await this.excelExporter.export(job.payload);
      } else if (job.payload.format === 'pdf') {
        result = await this.pdfExporter.export(job.payload);
      } else {
        throw new Error(`Unsupported export format: ${job.payload.format}`);
      }

      // Create artifact record
      await prisma.artifact.create({
        data: {
          jobId: job.payload.jobId,
          filename: result.filename,
          s3Key: result.s3Key,
          s3Bucket: result.s3Bucket,
          contentType: result.contentType,
          fileSize: result.fileSize,
          checksum: result.checksum,
        },
      });

      // Update job status to completed
      await prisma.job.update({
        where: { id: job.payload.jobId },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });

      // Log job completion
      await prisma.jobLog.create({
        data: {
          jobId: job.payload.jobId,
          level: 'info',
          message: 'Job completed successfully',
          metadata: {
            filename: result.filename,
            fileSize: result.fileSize,
            processingTime: Date.now() - job.createdAt,
          },
        },
      });

      // Mark job as completed in queue
      await completeJob(QUEUE_NAME, job);

      logger.info(`Job ${job.id} completed successfully`);
    } catch (error) {
      logger.error(`Job ${job.id} failed:`, error);

      // Log job error
      await prisma.jobLog.create({
        data: {
          jobId: job.payload.jobId,
          level: 'error',
          message: `Job failed: ${error.message}`,
          metadata: { error: error.stack },
        },
      });

      // Update job status to failed or retry
      const shouldRetry = job.attempts < job.maxAttempts;
      
      if (shouldRetry) {
        await failJob(QUEUE_NAME, job, error.message);
        logger.info(`Job ${job.id} will be retried (attempt ${job.attempts + 1}/${job.maxAttempts})`);
      } else {
        await prisma.job.update({
          where: { id: job.payload.jobId },
          data: {
            status: 'failed',
            completedAt: new Date(),
          },
        });
        
        await failJob(QUEUE_NAME, job, error.message);
        logger.error(`Job ${job.id} failed permanently after ${job.attempts} attempts`);
      }
    }
  }

  private async cleanup() {
    try {
      const cleanedUp = await cleanupExpiredJobs(QUEUE_NAME);
      if (cleanedUp > 0) {
        logger.info(`Cleaned up ${cleanedUp} expired jobs`);
      }
    } catch (error) {
      logger.error('Cleanup error:', error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Graceful shutdown handling
const worker = new ExportWorker();

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await worker.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await worker.stop();
  process.exit(0);
});

// Start the worker
worker.start().catch((error) => {
  logger.error('Worker startup failed:', error);
  process.exit(1);
});
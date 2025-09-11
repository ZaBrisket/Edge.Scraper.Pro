const { PrismaClient } = require('@prisma/client');
const { enqueueJob } = require('./utils/redis');
const { z } = require('zod');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Request schema validation
const ExportJobRequestSchema = z.object({
  datasetId: z.string().min(1),
  templateId: z.string().min(1),
  format: z.enum(['xlsx', 'pdf']),
  theme: z.string().default('utss-2025'),
  idempotencyKey: z.string().optional(),
  customMapping: z.record(z.string()).optional(),
});

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: {
          code: 'method_not_allowed',
          message: 'Only POST method is allowed',
        },
      }),
    };
  }

  try {
    // Parse and validate request body
    const body = JSON.parse(event.body || '{}');
    
    // Get idempotency key from header or body
    const idempotencyKey = event.headers['idempotency-key'] || 
                          event.headers['Idempotency-Key'] || 
                          body.idempotencyKey;
    
    const validatedData = ExportJobRequestSchema.parse({
      ...body,
      idempotencyKey,
    });

    // TODO: Add authentication
    const userId = 'mock-user-id';

    // Verify dataset exists and belongs to user
    const dataset = await prisma.dataset.findFirst({
      where: {
        id: validatedData.datasetId,
        userId: userId,
      },
      include: {
        uploads: {
          where: { status: 'committed' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!dataset || dataset.uploads.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: {
            code: 'dataset_not_found',
            message: 'Dataset not found or no committed upload',
          },
        }),
      };
    }

    // Verify template exists
    const template = await prisma.mappingTemplate.findUnique({
      where: { id: validatedData.templateId },
      include: { fieldDefs: true },
    });

    if (!template) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: {
            code: 'template_not_found',
            message: 'Mapping template not found',
          },
        }),
      };
    }

    // Generate idempotency key if not provided
    const finalIdempotencyKey = validatedData.idempotencyKey || 
      crypto.createHash('sha256')
        .update(`${validatedData.datasetId}-${validatedData.templateId}-${validatedData.format}-${Date.now()}`)
        .digest('hex');

    // Check for existing job with same idempotency key
    if (validatedData.idempotencyKey) {
      const existingJob = await prisma.job.findUnique({
        where: { idempotencyKey: validatedData.idempotencyKey },
        include: { artifacts: true },
      });

      if (existingJob) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            jobId: existingJob.id,
            status: existingJob.status,
            createdAt: existingJob.createdAt,
            artifacts: existingJob.artifacts.map(artifact => ({
              id: artifact.id,
              filename: artifact.filename,
              contentType: artifact.contentType,
              fileSize: artifact.fileSize,
              createdAt: artifact.createdAt,
            })),
          }),
        };
      }
    }

    // Create job record
    const job = await prisma.job.create({
      data: {
        userId: userId,
        datasetId: validatedData.datasetId,
        templateId: validatedData.templateId,
        format: validatedData.format,
        theme: validatedData.theme,
        status: 'queued',
        idempotencyKey: finalIdempotencyKey,
        payload: {
          customMapping: validatedData.customMapping,
          s3Key: dataset.uploads[0].s3Key,
          contentType: dataset.uploads[0].contentType,
        },
      },
    });

    // Enqueue job for processing
    const queueJobId = await enqueueJob(
      'export-jobs',
      'export',
      {
        jobId: job.id,
        datasetId: validatedData.datasetId,
        templateId: validatedData.templateId,
        format: validatedData.format,
        theme: validatedData.theme,
        customMapping: validatedData.customMapping,
        s3Key: dataset.uploads[0].s3Key,
        contentType: dataset.uploads[0].contentType,
      },
      {
        jobId: job.id,
        maxAttempts: 3,
      }
    );

    // Log job creation
    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: 'info',
        message: 'Export job created and queued for processing',
        metadata: {
          queueJobId,
          format: validatedData.format,
          theme: validatedData.theme,
        },
      },
    });

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        jobId: job.id,
        status: job.status,
        format: job.format,
        theme: job.theme,
        createdAt: job.createdAt,
        estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes estimate
      }),
    };
  } catch (error) {
    console.error('Export job creation error:', error);

    if (error.name === 'ZodError') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: {
            code: 'validation_error',
            message: 'Invalid request data',
            details: error.errors,
          },
        }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: {
          code: 'internal_server_error',
          message: 'Failed to create export job',
        },
      }),
    };
  } finally {
    await prisma.$disconnect();
  }
};
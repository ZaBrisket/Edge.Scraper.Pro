const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: {
          code: 'method_not_allowed',
          message: 'Only GET method is allowed',
        },
      }),
    };
  }

  try {
    // Extract job ID from path
    const pathSegments = event.path.split('/');
    const jobId = pathSegments[pathSegments.length - 1];

    if (!jobId || jobId === 'jobs') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: {
            code: 'missing_job_id',
            message: 'Job ID is required',
          },
        }),
      };
    }

    // TODO: Add authentication and verify job belongs to user
    const userId = 'mock-user-id';

    // Find job with logs and artifacts
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        userId: userId,
      },
      include: {
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Latest 10 log entries
        },
        artifacts: {
          orderBy: { createdAt: 'desc' },
        },
        dataset: {
          select: {
            id: true,
            name: true,
            rowsEstimated: true,
          },
        },
        template: {
          select: {
            id: true,
            name: true,
            version: true,
          },
        },
      },
    });

    if (!job) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: {
            code: 'job_not_found',
            message: 'Job not found',
          },
        }),
      };
    }

    // Calculate progress and estimated completion
    let progress = 0;
    let estimatedCompletionTime = null;

    switch (job.status) {
      case 'queued':
        progress = 0;
        estimatedCompletionTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        break;
      case 'processing':
        progress = 50;
        const elapsedTime = Date.now() - new Date(job.startedAt || job.createdAt).getTime();
        estimatedCompletionTime = new Date(Date.now() + Math.max(60000, elapsedTime)); // At least 1 minute
        break;
      case 'completed':
        progress = 100;
        break;
      case 'failed':
        progress = 0;
        break;
      default:
        progress = 0;
    }

    // Calculate duration
    const duration = job.completedAt 
      ? new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime()
      : Date.now() - new Date(job.createdAt).getTime();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        id: job.id,
        status: job.status,
        format: job.format,
        theme: job.theme,
        progress,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        duration: Math.round(duration / 1000), // Duration in seconds
        estimatedCompletionTime: estimatedCompletionTime?.toISOString(),
        dataset: job.dataset,
        template: job.template,
        artifacts: job.artifacts.map(artifact => ({
          id: artifact.id,
          filename: artifact.filename,
          contentType: artifact.contentType,
          fileSize: artifact.fileSize,
          createdAt: artifact.createdAt,
        })),
        logs: job.logs.map(log => ({
          id: log.id,
          level: log.level,
          message: log.message,
          createdAt: log.createdAt,
          metadata: log.metadata,
        })),
        payload: job.payload,
      }),
    };
  } catch (error) {
    console.error('Job status error:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: {
          code: 'internal_server_error',
          message: 'Failed to get job status',
        },
      }),
    };
  } finally {
    await prisma.$disconnect();
  }
};
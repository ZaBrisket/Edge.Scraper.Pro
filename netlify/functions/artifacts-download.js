const { PrismaClient } = require('@prisma/client');
const { generatePresignedDownload } = require('./utils/s3');

const prisma = new PrismaClient();

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
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
    // Extract artifact ID from path
    const pathSegments = event.path.split('/');
    const artifactId = pathSegments[pathSegments.length - 2]; // /api/artifacts/:id/signed-url

    if (!artifactId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: {
            code: 'missing_artifact_id',
            message: 'Artifact ID is required',
          },
        }),
      };
    }

    // TODO: Add authentication and verify artifact access permissions
    const userId = 'mock-user-id';

    // Find artifact and verify access
    const artifact = await prisma.artifact.findFirst({
      where: { id: artifactId },
      include: {
        job: {
          include: {
            user: true,
            dataset: true,
          },
        },
      },
    });

    if (!artifact) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: {
            code: 'artifact_not_found',
            message: 'Artifact not found',
          },
        }),
      };
    }

    // Verify user has access to this artifact
    if (artifact.job.userId !== userId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error: {
            code: 'access_denied',
            message: 'You do not have access to this artifact',
          },
        }),
      };
    }

    // Check if artifact has expired
    if (artifact.expiresAt && new Date(artifact.expiresAt) < new Date()) {
      return {
        statusCode: 410,
        headers,
        body: JSON.stringify({
          error: {
            code: 'artifact_expired',
            message: 'Artifact has expired and is no longer available',
          },
        }),
      };
    }

    // Generate presigned download URL (valid for 1 hour)
    const downloadData = await generatePresignedDownload(artifact.s3Key, 3600);

    // Track download (optional analytics)
    await prisma.jobLog.create({
      data: {
        jobId: artifact.jobId,
        level: 'info',
        message: 'Artifact download initiated',
        metadata: {
          artifactId: artifact.id,
          filename: artifact.filename,
          userAgent: event.headers['user-agent'],
          ip: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
        },
      },
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        downloadUrl: downloadData.downloadUrl,
        expiresAt: downloadData.expiresAt.toISOString(),
        artifact: {
          id: artifact.id,
          filename: artifact.filename,
          contentType: artifact.contentType,
          fileSize: artifact.fileSize,
          createdAt: artifact.createdAt,
        },
        job: {
          id: artifact.job.id,
          format: artifact.job.format,
          theme: artifact.job.theme,
          createdAt: artifact.job.createdAt,
        },
        dataset: {
          id: artifact.job.dataset.id,
          name: artifact.job.dataset.name,
        },
      }),
    };
  } catch (error) {
    console.error('Artifact download error:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: {
          code: 'internal_server_error',
          message: 'Failed to generate download URL',
        },
      }),
    };
  } finally {
    await prisma.$disconnect();
  }
};
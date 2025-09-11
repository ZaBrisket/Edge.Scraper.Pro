const { PrismaClient } = require('@prisma/client');
const { generatePresignedUpload } = require('./utils/s3');
const { z } = require('zod');

const prisma = new PrismaClient();

// Request schema validation
const PresignRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']),
  maxFileSize: z.number().optional().default(10 * 1024 * 1024), // 10MB default
});

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    const validatedData = PresignRequestSchema.parse(body);

    // TODO: Add authentication/authorization
    // For now, we'll use a mock user ID
    const userId = 'mock-user-id';

    // Generate presigned upload URL
    const presignedData = await generatePresignedUpload(
      validatedData.filename,
      validatedData.contentType,
      validatedData.maxFileSize
    );

    // Create upload record in database
    const upload = await prisma.upload.create({
      data: {
        s3Key: presignedData.s3Key,
        s3Bucket: process.env.S3_BUCKET || 'edge-scraper-pro-artifacts',
        filename: validatedData.filename,
        contentType: validatedData.contentType,
        expiresAt: presignedData.expiresAt,
        status: 'pending',
        dataset: {
          create: {
            name: validatedData.filename,
            originalFilename: validatedData.filename,
            fileSize: 0, // Will be updated on commit
            mimeType: validatedData.contentType,
            userId: userId,
          },
        },
      },
      include: {
        dataset: true,
      },
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        uploadUrl: presignedData.uploadUrl,
        s3Key: presignedData.s3Key,
        expiresAt: presignedData.expiresAt.toISOString(),
        datasetId: upload.dataset.id,
        uploadId: upload.id,
      }),
    };
  } catch (error) {
    console.error('Upload presign error:', error);

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
          message: 'Failed to generate presigned upload URL',
        },
      }),
    };
  } finally {
    await prisma.$disconnect();
  }
};
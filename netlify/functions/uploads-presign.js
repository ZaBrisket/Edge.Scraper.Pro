const { PrismaClient } = require('@prisma/client');
const { generatePresignedUpload } = require('./utils/s3');
const { z } = require('zod');
const { AuthService, Permission } = require('../../src/lib/auth');
const { ValidationUtils, schemas } = require('../../src/lib/validation');

const prisma = new PrismaClient();

// Use centralized validation schema
const PresignRequestSchema = schemas.targetList.uploadPresign;

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
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
    // Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: {
            code: 'missing_token',
            message: 'Authorization token required',
          },
        }),
      };
    }

    const token = authHeader.substring(7);
    const payload = AuthService.verifyToken(token);
    
    // Check permissions
    if (!AuthService.hasPermission(payload.permissions, Permission.WRITE_TARGETS)) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error: {
            code: 'insufficient_permissions',
            message: 'Insufficient permissions to upload files',
          },
        }),
      };
    }

    // Parse and validate request body
    const body = JSON.parse(event.body || '{}');
    const validatedData = ValidationUtils.validateBody(PresignRequestSchema, body);

    const userId = payload.userId;

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
const { PrismaClient } = require('../../src/generated/prisma');
const { objectExists, getObjectMetadata } = require('../../src/lib/infrastructure/s3');
const AWS = require('aws-sdk');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { z } = require('zod');

const prisma = new PrismaClient();

// Configure AWS S3
const s3 = new AWS.S3({
  region: process.env.S3_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// Request schema validation
const CommitRequestSchema = z.object({
  s3Key: z.string().min(1),
  datasetName: z.string().optional(),
});

/**
 * Estimate row count from CSV/Excel file
 */
async function estimateRowCount(s3Key, contentType) {
  try {
    const bucket = process.env.S3_BUCKET || 'edge-scraper-pro-artifacts';
    
    // Get file from S3
    const result = await s3.getObject({
      Bucket: bucket,
      Key: s3Key,
    }).promise();

    if (contentType === 'text/csv') {
      // For CSV, count newlines in a sample
      const content = result.Body.toString('utf8');
      const lines = content.split('\n').filter(line => line.trim());
      return Math.max(0, lines.length - 1); // Subtract header row
    } else {
      // For Excel files
      const workbook = xlsx.read(result.Body, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1:A1');
      return Math.max(0, range.e.r); // End row (0-indexed), so this gives us row count minus header
    }
  } catch (error) {
    console.error('Error estimating row count:', error);
    return null;
  }
}

/**
 * Parse first few rows to detect headers
 */
async function parseHeaders(s3Key, contentType) {
  try {
    const bucket = process.env.S3_BUCKET || 'edge-scraper-pro-artifacts';
    
    // Get file from S3
    const result = await s3.getObject({
      Bucket: bucket,
      Key: s3Key,
    }).promise();

    if (contentType === 'text/csv') {
      // Parse CSV headers
      const content = result.Body.toString('utf8');
      const lines = content.split('\n');
      if (lines.length > 0) {
        const headerLine = lines[0];
        // Simple CSV parsing - in production, use proper CSV parser
        const headers = headerLine.split(',').map(h => h.replace(/['"]/g, '').trim());
        return headers.filter(h => h.length > 0);
      }
    } else {
      // Parse Excel headers
      const workbook = xlsx.read(result.Body, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Get first row as headers
      const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1:A1');
      const headers = [];
      
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = xlsx.utils.encode_cell({ r: 0, c: col });
        const cell = worksheet[cellAddress];
        if (cell && cell.v) {
          headers.push(cell.v.toString().trim());
        }
      }
      
      return headers.filter(h => h.length > 0);
    }
    
    return [];
  } catch (error) {
    console.error('Error parsing headers:', error);
    return [];
  }
}

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
    const validatedData = CommitRequestSchema.parse(body);

    // Find the upload record
    const upload = await prisma.upload.findUnique({
      where: { s3Key: validatedData.s3Key },
      include: { dataset: true },
    });

    if (!upload) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: {
            code: 'upload_not_found',
            message: 'Upload record not found',
          },
        }),
      };
    }

    if (upload.status !== 'pending') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: {
            code: 'upload_already_committed',
            message: 'Upload has already been committed or failed',
          },
        }),
      };
    }

    // Verify file exists in S3
    const fileExists = await objectExists(validatedData.s3Key);
    if (!fileExists) {
      await prisma.upload.update({
        where: { id: upload.id },
        data: { status: 'failed' },
      });

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: {
            code: 'file_not_found',
            message: 'File not found in storage',
          },
        }),
      };
    }

    // Get file metadata
    const metadata = await getObjectMetadata(validatedData.s3Key);
    
    // Estimate row count and parse headers
    const [rowsEstimated, detectedHeaders] = await Promise.all([
      estimateRowCount(validatedData.s3Key, upload.contentType),
      parseHeaders(validatedData.s3Key, upload.contentType),
    ]);

    // Update upload and dataset records
    const updatedUpload = await prisma.upload.update({
      where: { id: upload.id },
      data: {
        status: 'committed',
        fileSize: metadata.contentLength,
        dataset: {
          update: {
            name: validatedData.datasetName || upload.dataset.name,
            fileSize: metadata.contentLength,
            rowsEstimated: rowsEstimated,
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
        datasetId: updatedUpload.dataset.id,
        uploadId: updatedUpload.id,
        rowsEstimated: rowsEstimated,
        detectedHeaders: detectedHeaders,
        fileSize: metadata.contentLength,
        status: 'committed',
      }),
    };
  } catch (error) {
    console.error('Upload commit error:', error);

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
          message: 'Failed to commit upload',
        },
      }),
    };
  } finally {
    await prisma.$disconnect();
  }
};
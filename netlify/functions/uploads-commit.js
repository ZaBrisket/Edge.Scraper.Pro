const { PrismaClient } = require('@prisma/client');
const { objectExists, getObjectMetadata, s3, BUCKET } = require('./utils/s3');
const csv = require('csv-parser');
const ExcelJS = require('exceljs');
const { z } = require('zod');
const { ValidationUtils, schemas } = require('../../src/lib/validation');

const prisma = new PrismaClient();

// Use centralized validation schema
const CommitRequestSchema = schemas.targetList.uploadCommit;

/**
 * Estimate row count from CSV/Excel file using streaming/chunked approach
 */
async function estimateRowCount(s3Key, contentType) {
  try {
    const BUCKET = process.env.S3_BUCKET || 'edge-scraper-pro-artifacts';
    
    if (contentType === 'text/csv') {
      // For CSV, stream and count newlines without loading full content
      return await estimateCsvRowCount(s3Key);
    } else {
      // For Excel files, we need to load the file but only read the range
      const result = await s3.getObject({
        Bucket: BUCKET,
        Key: s3Key,
      }).promise();
      
      // Read only the worksheet range, not the full data
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.Body);
      
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return 0;
      }
      
      return worksheet.rowCount; // Total row count
    }
  } catch (error) {
    console.error('Error estimating row count:', error);
    return null;
  }
}

/**
 * Stream CSV and count lines without loading full content into memory
 */
async function estimateCsvRowCount(s3Key) {
  return new Promise((resolve, reject) => {
    let lineCount = 0;
    let buffer = '';
    let isFirstChunk = true;
    
    const stream = s3.getObject({
      Bucket: BUCKET,
      Key: s3Key,
    }).createReadStream();
    
    stream.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      
      // Process complete lines
      const lines = buffer.split('\n');
      
      // Keep the last incomplete line in buffer
      buffer = lines.pop() || '';
      
      // Count lines (skip header on first chunk)
      if (isFirstChunk && lines.length > 0) {
        lineCount += Math.max(0, lines.length - 1); // Skip header
        isFirstChunk = false;
      } else {
        lineCount += lines.length;
      }
      
      // Memory safety: if buffer gets too large, process it
      if (buffer.length > 1024 * 1024) { // 1MB buffer limit
        if (buffer.includes('\n')) {
          const bufferLines = buffer.split('\n');
          lineCount += bufferLines.length - 1;
          buffer = bufferLines[bufferLines.length - 1];
        }
      }
    });
    
    stream.on('end', () => {
      // Count final line if buffer has content
      if (buffer.trim()) {
        lineCount += 1;
      }
      resolve(lineCount);
    });
    
    stream.on('error', reject);
  });
}

/**
 * Parse first few rows to detect headers using streaming approach
 */
async function parseHeaders(s3Key, contentType) {
  try {
    const BUCKET = process.env.S3_BUCKET || 'edge-scraper-pro-artifacts';
    
    if (contentType === 'text/csv') {
      // Stream only the first chunk to get headers
      return await parseCsvHeaders(BUCKET, s3Key);
    } else {
      // For Excel, we need to read the file but only parse the header row
      const result = await s3.getObject({
        Bucket: BUCKET,
        Key: s3Key,
      }).promise();

      // Read only the first row for headers
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(result.Body);
      
      const worksheet = workbook.worksheets[0];
      if (!worksheet) return [];
      
      // Get first row as headers
      const headers = [];
      const firstRow = worksheet.getRow(1);
      
      firstRow.eachCell((cell, colNumber) => {
        if (cell.value) {
          headers.push(cell.value.toString().trim());
        }
      });
      
      return headers.filter(h => h.length > 0);
    }
  } catch (error) {
    console.error('Error parsing headers:', error);
    return [];
  }
}

/**
 * Stream CSV and parse only the header row
 */
async function parseCsvHeaders(BUCKET, s3Key) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let headersParsed = false;
    
    const stream = s3.getObject({
      Bucket: BUCKET,
      Key: s3Key,
    }).createReadStream();
    
    stream.on('data', (chunk) => {
      if (headersParsed) {
        stream.destroy(); // Stop reading once we have headers
        return;
      }
      
      buffer += chunk.toString('utf8');
      
      // Look for first complete line
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        const headerLine = buffer.substring(0, newlineIndex);
        
        // Parse CSV header line (simple parsing)
        const headers = headerLine.split(',').map(h => h.replace(/['"]/g, '').trim());
        const validHeaders = headers.filter(h => h.length > 0);
        
        headersParsed = true;
        stream.destroy();
        resolve(validHeaders);
      }
      
      // Safety check: if no newline in first 64KB, something's wrong
      if (buffer.length > 64 * 1024) {
        stream.destroy();
        reject(new Error('No header line found in first 64KB of file'));
      }
    });
    
    stream.on('end', () => {
      if (!headersParsed && buffer.trim()) {
        // File has only one line (header only)
        const headers = buffer.trim().split(',').map(h => h.replace(/['"]/g, '').trim());
        resolve(headers.filter(h => h.length > 0));
      } else if (!headersParsed) {
        resolve([]);
      }
    });
    
    stream.on('error', reject);
  });
}

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
    // Parse and validate request body
    const body = JSON.parse(event.body || '{}');
    const validatedData = ValidationUtils.validateBody(CommitRequestSchema, body);

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
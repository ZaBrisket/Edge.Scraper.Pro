const { PrismaClient } = require('../../src/generated/prisma');
const { transformRow } = require('../../src/lib/mapping/transforms');
const AWS = require('aws-sdk');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { z } = require('zod');
const { Readable } = require('stream');

const prisma = new PrismaClient();

// Configure AWS S3
const s3 = new AWS.S3({
  region: process.env.S3_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// Request schema validation
const PreviewRequestSchema = z.object({
  datasetId: z.string().min(1),
  templateId: z.string().min(1),
  sampleSize: z.number().min(1).max(100).default(50),
  customMapping: z.record(z.string()).optional(), // sourceHeader -> targetField override
});

/**
 * Parse CSV data and return sample rows
 */
async function parseCsvSample(buffer, sampleSize) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let headers = null;
    let rowCount = 0;
    
    const stream = Readable.from(buffer.toString('utf8'));
    
    stream
      .pipe(csv())
      .on('headers', (headerList) => {
        headers = headerList;
      })
      .on('data', (row) => {
        if (rowCount < sampleSize) {
          rows.push(row);
          rowCount++;
        } else {
          // Stop parsing after we have enough samples
          stream.destroy();
        }
      })
      .on('end', () => {
        resolve({ headers, rows });
      })
      .on('error', reject);
  });
}

/**
 * Parse Excel data and return sample rows
 */
function parseExcelSample(buffer, sampleSize) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Convert to JSON with header row
  const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
  
  if (jsonData.length === 0) {
    return { headers: [], rows: [] };
  }
  
  const headers = jsonData[0].map(h => h ? h.toString().trim() : '');
  const dataRows = jsonData.slice(1, sampleSize + 1);
  
  // Convert array rows to objects
  const rows = dataRows.map(row => {
    const rowObject = {};
    headers.forEach((header, index) => {
      if (header) {
        rowObject[header] = row[index] !== undefined ? row[index] : '';
      }
    });
    return rowObject;
  });
  
  return { headers: headers.filter(h => h.length > 0), rows };
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
    const validatedData = PreviewRequestSchema.parse(body);

    // Get dataset with upload information
    const dataset = await prisma.dataset.findUnique({
      where: { id: validatedData.datasetId },
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

    // Get mapping template with field definitions
    const template = await prisma.mappingTemplate.findUnique({
      where: { id: validatedData.templateId },
      include: {
        fieldDefs: true,
      },
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

    const upload = dataset.uploads[0];
    const bucket = process.env.S3_BUCKET || 'edge-scraper-pro-artifacts';

    // Download file from S3
    const s3Object = await s3.getObject({
      Bucket: bucket,
      Key: upload.s3Key,
    }).promise();

    // Parse file based on content type
    let parseResult;
    if (upload.contentType === 'text/csv') {
      parseResult = await parseCsvSample(s3Object.Body, validatedData.sampleSize);
    } else {
      parseResult = parseExcelSample(s3Object.Body, validatedData.sampleSize);
    }

    const { headers: detectedHeaders, rows: sampleRows } = parseResult;

    // Apply auto-mapping or use custom mapping
    let mapping = validatedData.customMapping || {};
    
    if (!validatedData.customMapping) {
      // Auto-map headers using the template
      const { autoMapHeaders } = require('../../src/lib/mapping/header-detector');
      const autoMappingResult = autoMapHeaders(detectedHeaders, template.fieldDefs);
      
      // Convert matches to mapping object
      mapping = {};
      for (const match of autoMappingResult.matches) {
        mapping[match.sourceHeader] = match.targetField;
      }
    }

    // Transform sample rows
    const transformedRows = sampleRows.map(row => 
      transformRow(row, mapping, template.fieldDefs)
    );

    // Get target field definitions for UI
    const targetFields = template.fieldDefs.map(fieldDef => ({
      name: fieldDef.targetField,
      required: fieldDef.required,
      transform: fieldDef.transform,
      defaultValue: fieldDef.defaultValue,
    }));

    // Calculate mapping statistics
    const mappedHeaders = Object.keys(mapping).filter(header => mapping[header]);
    const unmappedHeaders = detectedHeaders.filter(header => !mapping[header]);
    const requiredFieldsMapped = template.fieldDefs
      .filter(fd => fd.required)
      .filter(fd => Object.values(mapping).includes(fd.targetField));
    
    const mappingStats = {
      totalHeaders: detectedHeaders.length,
      mappedHeaders: mappedHeaders.length,
      unmappedHeaders: unmappedHeaders.length,
      requiredFieldsTotal: template.fieldDefs.filter(fd => fd.required).length,
      requiredFieldsMapped: requiredFieldsMapped.length,
      mappingComplete: requiredFieldsMapped.length === template.fieldDefs.filter(fd => fd.required).length,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        dataset: {
          id: dataset.id,
          name: dataset.name,
          rowsEstimated: dataset.rowsEstimated,
          fileSize: dataset.fileSize,
        },
        template: {
          id: template.id,
          name: template.name,
          version: template.version,
        },
        columns: {
          detected: detectedHeaders,
          target: targetFields,
        },
        mapping,
        mappingStats,
        sampleRows: {
          original: sampleRows,
          transformed: transformedRows,
        },
        unmappedHeaders,
      }),
    };
  } catch (error) {
    console.error('Preview API error:', error);

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

    if (error.code === 'NoSuchKey') {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: {
            code: 'file_not_found',
            message: 'Source file not found in storage',
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
          message: 'Failed to generate preview',
        },
      }),
    };
  } finally {
    await prisma.$disconnect();
  }
};
const { PrismaClient } = require('@prisma/client');
const { transformRow } = require('./utils/transforms');
const { s3, BUCKET } = require('./utils/s3');
const csv = require('csv-parser');
const ExcelJS = require('exceljs');
const { z } = require('zod');
const { ValidationUtils, schemas } = require('../../dist/lib/validation');

const prisma = new PrismaClient();

// Use centralized validation schema
const PreviewRequestSchema = schemas.targetList.preview;

/**
 * Parse CSV data and return sample rows using streaming approach
 */
async function parseCsvSample(s3Key, sampleSize) {
  
  return new Promise((resolve, reject) => {
    const rows = [];
    let headers = null;
    let rowCount = 0;
    
    // Create S3 stream instead of loading full buffer
    const s3Stream = s3.getObject({
      Bucket: BUCKET,
      Key: s3Key,
    }).createReadStream();
    
    s3Stream
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
          s3Stream.destroy();
        }
      })
      .on('end', () => {
        resolve({ headers, rows });
      })
      .on('error', reject);
  });
}

/**
 * Parse Excel data and return sample rows with memory optimization
 */
async function parseExcelSample(buffer, sampleSize) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { headers: [], rows: [] };
  }
  
  const rows = [];
  let headers = [];
  let rowCount = 0;
  
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > sampleSize + 1) return; // Stop after sample size + header
    
    const rowData = [];
    row.eachCell((cell, colNumber) => {
      rowData[colNumber - 1] = cell.value;
    });
    
    if (rowNumber === 1) {
      // Header row
      headers = rowData.map((h) => h ? h.toString().trim() : '');
    } else {
      // Data row
      const rowObject = {};
      headers.forEach((header, index) => {
        if (header) {
          rowObject[header] = rowData[index] !== undefined ? rowData[index] : '';
        }
      });
      rows.push(rowObject);
    }
  });
  
  return { headers: headers.filter(h => h.length > 0), rows };
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
    const validatedData = ValidationUtils.validateBody(PreviewRequestSchema, body);

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

    // Parse file based on content type using streaming/optimized approach
    let parseResult;
    if (upload.contentType === 'text/csv') {
      // Use streaming approach for CSV
      parseResult = await parseCsvSample(upload.s3Key, validatedData.sampleSize);
    } else {
      // For Excel, download but with optimized parsing
      const s3Object = await s3.getObject({
        Bucket: BUCKET,
        Key: upload.s3Key,
      }).promise();
      parseResult = await parseExcelSample(s3Object.Body, validatedData.sampleSize);
    }

    const { headers: detectedHeaders, rows: sampleRows } = parseResult;

    // Apply auto-mapping or use custom mapping
    let mapping = validatedData.customMapping || {};
    
    if (!validatedData.customMapping) {
      // Auto-map headers using the template
      const { autoMapHeaders } = require('../../dist/lib/mapping/header-detector');
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
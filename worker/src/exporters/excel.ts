import ExcelJS from 'exceljs';
import AWS from 'aws-sdk';
import csv from 'csv-parser';
import xlsx from 'xlsx';
import { Readable } from 'stream';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { transformRow } from '../../../src/lib/mapping/transforms';
import { generateArtifactKey } from '../../../src/lib/infrastructure/s3';
import { createLogger } from '../utils/logger';

const logger = createLogger('excel-exporter');
const prisma = new PrismaClient();

// Configure AWS S3
const s3 = new AWS.S3({
  region: process.env.S3_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

export interface ExportPayload {
  jobId: string;
  datasetId: string;
  templateId: string;
  format: string;
  theme: string;
  customMapping?: Record<string, string>;
  s3Key: string;
  contentType: string;
}

export interface ExportResult {
  filename: string;
  s3Key: string;
  s3Bucket: string;
  contentType: string;
  fileSize: number;
  checksum: string;
}

export class ExcelExporter {
  private readonly bucket = process.env.S3_BUCKET || 'edge-scraper-pro-artifacts';

  async export(payload: ExportPayload): Promise<ExportResult> {
    logger.info(`Starting Excel export for job ${payload.jobId}`);

    // Get template and dataset info
    const [template, dataset] = await Promise.all([
      prisma.mappingTemplate.findUnique({
        where: { id: payload.templateId },
        include: { fieldDefs: true },
      }),
      prisma.dataset.findUnique({
        where: { id: payload.datasetId },
      }),
    ]);

    if (!template || !dataset) {
      throw new Error('Template or dataset not found');
    }

    // Parse source data using streaming/optimized approach
    const sourceData = await this.parseSourceData(payload.s3Key, payload.contentType);
    logger.info(`Parsed ${sourceData.rows.length} rows from source file`);

    // Apply mapping and transformations
    const mapping = payload.customMapping || this.generateAutoMapping(sourceData.headers, template.fieldDefs);
    const transformedData = this.transformData(sourceData.rows, mapping, template.fieldDefs);
    logger.info(`Transformed data with ${Object.keys(mapping).length} mapped columns`);

    // Create Excel workbook
    const workbook = await this.createExcelWorkbook(transformedData, template, dataset, payload.theme);

    // Generate file buffer
    const buffer = await workbook.xlsx.writeBuffer() as Buffer;
    const checksum = createHash('md5').update(buffer).digest('hex');

    // Upload to S3
    const filename = `${dataset.name}_${payload.format}_${Date.now()}.xlsx`;
    const s3Key = generateArtifactKey(payload.jobId, filename, 'xlsx');

    await s3.upload({
      Bucket: this.bucket,
      Key: s3Key,
      Body: buffer,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      Metadata: {
        jobId: payload.jobId,
        originalFilename: filename,
        checksum: checksum,
      },
    }).promise();

    logger.info(`Excel export completed: ${filename} (${buffer.length} bytes)`);

    return {
      filename,
      s3Key,
      s3Bucket: this.bucket,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: buffer.length,
      checksum,
    };
  }

  private async parseSourceData(s3Key: string, contentType: string): Promise<{
    headers: string[];
    rows: Array<Record<string, any>>;
  }> {
    if (contentType === 'text/csv') {
      return this.parseCsvData(s3Key);
    } else {
      // For Excel, we still need to download, but we can optimize the parsing
      const sourceObject = await s3.getObject({
        Bucket: this.bucket,
        Key: s3Key,
      }).promise();
      return this.parseExcelData(sourceObject.Body as Buffer);
    }
  }

  private async parseCsvData(s3Key: string): Promise<{
    headers: string[];
    rows: Array<Record<string, any>>;
  }> {
    return new Promise((resolve, reject) => {
      const rows: Array<Record<string, any>> = [];
      let headers: string[] = [];

      // Stream directly from S3 instead of loading buffer into memory
      const s3Stream = s3.getObject({
        Bucket: this.bucket,
        Key: s3Key,
      }).createReadStream();
      
      s3Stream
        .pipe(csv())
        .on('headers', (headerList: string[]) => {
          headers = headerList;
        })
        .on('data', (row: Record<string, any>) => {
          rows.push(row);
        })
        .on('end', () => {
          resolve({ headers, rows });
        })
        .on('error', reject);
    });
  }

  private parseExcelData(buffer: Buffer): {
    headers: string[];
    rows: Array<Record<string, any>>;
  } {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to JSON with header row
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    
    if (jsonData.length === 0) {
      return { headers: [], rows: [] };
    }
    
    const headers = jsonData[0].map((h: any) => h ? h.toString().trim() : '');
    const dataRows = jsonData.slice(1);
    
    // Convert array rows to objects
    const rows = dataRows.map(row => {
      const rowObject: Record<string, any> = {};
      headers.forEach((header, index) => {
        if (header) {
          rowObject[header] = row[index] !== undefined ? row[index] : '';
        }
      });
      return rowObject;
    });
    
    return { headers: headers.filter(h => h.length > 0), rows };
  }

  private generateAutoMapping(headers: string[], fieldDefs: any[]): Record<string, string> {
    const mapping: Record<string, string> = {};
    const usedTargetFields = new Set<string>();

    // Simple auto-mapping logic
    for (const header of headers) {
      const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      for (const fieldDef of fieldDefs) {
        if (usedTargetFields.has(fieldDef.targetField)) continue;
        
        for (const candidateHeader of fieldDef.sourceHeaders) {
          const normalizedCandidate = candidateHeader.toLowerCase().replace(/[^a-z0-9]/g, '');
          
          if (normalizedHeader === normalizedCandidate || 
              normalizedHeader.includes(normalizedCandidate) ||
              normalizedCandidate.includes(normalizedHeader)) {
            mapping[header] = fieldDef.targetField;
            usedTargetFields.add(fieldDef.targetField);
            break;
          }
        }
        
        if (mapping[header]) break;
      }
    }

    return mapping;
  }

  private transformData(
    rows: Array<Record<string, any>>,
    mapping: Record<string, string>,
    fieldDefs: any[]
  ): Array<Record<string, any>> {
    return rows.map(row => transformRow(row, mapping, fieldDefs));
  }

  private async createExcelWorkbook(
    data: Array<Record<string, any>>,
    template: any,
    dataset: any,
    theme: string
  ): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    
    // Set workbook properties
    workbook.creator = 'Edge Scraper Pro';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.title = `${dataset.name} - Target Universe`;

    const worksheet = workbook.addWorksheet('Target Universe', {
      properties: { tabColor: { argb: 'FF1a365d' } }
    });

    // Apply UTSS theme styling
    await this.applyUTSSTheme(worksheet, data, template, dataset);

    return workbook;
  }

  private async applyUTSSTheme(
    worksheet: ExcelJS.Worksheet,
    data: Array<Record<string, any>>,
    template: any,
    dataset: any
  ) {
    // Define UTSS color scheme
    const colors = {
      primaryBlue: 'FF1a365d',
      secondaryBlue: 'FF2d4a6b', 
      accentTeal: 'FF319795',
      lightGray: 'FFf7fafc',
      mediumGray: 'FFe2e8f0',
      darkGray: 'FF4a5568',
      white: 'FFffffff',
    };

    // Get target fields that have data
    const targetFields = template.fieldDefs
      .filter((fd: any) => data.some(row => row[fd.targetField] !== null && row[fd.targetField] !== undefined))
      .sort((a: any, b: any) => {
        // Sort by: required first, then alphabetical
        if (a.required !== b.required) return a.required ? -1 : 1;
        return a.targetField.localeCompare(b.targetField);
      });

    // Set column widths based on content
    const columnWidths: Record<string, number> = {
      rank: 8,
      companyName: 25,
      city: 15,
      state: 8,
      description: 35,
      estimatedRevenueMillions: 18,
      executiveName: 20,
      executiveTitle: 20,
      logoUrl: 25,
    };

    targetFields.forEach((field: any, index: number) => {
      const column = worksheet.getColumn(index + 1);
      column.width = columnWidths[field.targetField] || 15;
    });

    // Create header row with UTSS styling
    const headerRow = worksheet.addRow(
      targetFields.map((field: any) => this.formatFieldName(field.targetField))
    );

    headerRow.height = 25;
    headerRow.eachCell((cell, colNumber) => {
      // UTSS header styling
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colors.primaryBlue },
      };
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: colors.white },
      };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: colors.mediumGray } },
        left: { style: 'thin', color: { argb: colors.mediumGray } },
        bottom: { style: 'thin', color: { argb: colors.mediumGray } },
        right: { style: 'thin', color: { argb: colors.mediumGray } },
      };
    });

    // Add data rows with alternating colors (UTSS zebra striping)
    data.forEach((row, index) => {
      const dataRow = worksheet.addRow(
        targetFields.map((field: any) => this.formatCellValue(row[field.targetField], field))
      );

      dataRow.height = 20;
      dataRow.eachCell((cell, colNumber) => {
        const field = targetFields[colNumber - 1];
        
        // Zebra striping
        const isEvenRow = index % 2 === 0;
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEvenRow ? colors.white : colors.lightGray },
        };

        // Font styling
        cell.font = {
          name: 'Calibri',
          size: 10,
          color: { argb: colors.darkGray },
        };

        // Alignment based on field type
        cell.alignment = {
          horizontal: this.getFieldAlignment(field.targetField),
          vertical: 'middle',
          wrapText: field.targetField === 'description',
        };

        // Number formatting for revenue
        if (field.targetField === 'estimatedRevenueMillions') {
          cell.numFmt = '$#,##0.0"M"';
        }

        // Borders
        cell.border = {
          top: { style: 'thin', color: { argb: colors.mediumGray } },
          left: { style: 'thin', color: { argb: colors.mediumGray } },
          bottom: { style: 'thin', color: { argb: colors.mediumGray } },
          right: { style: 'thin', color: { argb: colors.mediumGray } },
        };
      });
    });

    // Freeze header row
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }
    ];

    // Add footer with UTSS branding
    const footerRowIndex = data.length + 3;
    const footerRow = worksheet.addRow([
      `Generated by Edge Scraper Pro • ${new Date().toLocaleDateString()} • Page 1 of 1`
    ]);
    
    worksheet.mergeCells(footerRowIndex, 1, footerRowIndex, targetFields.length);
    const footerCell = worksheet.getCell(footerRowIndex, 1);
    footerCell.font = {
      name: 'Calibri',
      size: 9,
      italic: true,
      color: { argb: colors.mediumGray },
    };
    footerCell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };

    // Auto-filter
    worksheet.autoFilter = {
      from: 'A1',
      to: `${String.fromCharCode(65 + targetFields.length - 1)}${data.length + 1}`
    };
  }

  private formatFieldName(fieldName: string): string {
    // Convert camelCase to Title Case
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  private formatCellValue(value: any, field: any): any {
    if (value === null || value === undefined) {
      return field.defaultValue || '';
    }

    // Apply Excel injection protection
    if (typeof value === 'string' && /^[=+\-@]/.test(value)) {
      return `'${value}`;
    }

    return value;
  }

  private getFieldAlignment(fieldName: string): 'left' | 'center' | 'right' {
    const numericFields = ['rank', 'estimatedRevenueMillions'];
    const centerFields = ['state'];
    
    if (numericFields.includes(fieldName)) return 'right';
    if (centerFields.includes(fieldName)) return 'center';
    return 'left';
  }
}
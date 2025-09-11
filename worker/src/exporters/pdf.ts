import { chromium } from 'playwright';
import AWS from 'aws-sdk';
import csv from 'csv-parser';
import xlsx from 'xlsx';
import { Readable } from 'stream';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { transformRow } from '../../../src/lib/mapping/transforms';
import { generateArtifactKey } from '../../../src/lib/infrastructure/s3';
import { createLogger } from '../utils/logger';
import type { ExportPayload, ExportResult } from './excel';

const logger = createLogger('pdf-exporter');
const prisma = new PrismaClient();

// Configure AWS S3
const s3 = new AWS.S3({
  region: process.env.S3_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

export class PDFExporter {
  private readonly bucket = process.env.S3_BUCKET || 'edge-scraper-pro-artifacts';

  async export(payload: ExportPayload): Promise<ExportResult> {
    logger.info(`Starting PDF export for job ${payload.jobId}`);

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

    // Generate PDF
    const pdfBuffer = await this.generatePDF(transformedData, template, dataset, payload.theme);
    const checksum = createHash('md5').update(pdfBuffer).digest('hex');

    // Upload to S3
    const filename = `${dataset.name}_${payload.format}_${Date.now()}.pdf`;
    const s3Key = generateArtifactKey(payload.jobId, filename, 'pdf');

    await s3.upload({
      Bucket: this.bucket,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        jobId: payload.jobId,
        originalFilename: filename,
        checksum: checksum,
      },
    }).promise();

    logger.info(`PDF export completed: ${filename} (${pdfBuffer.length} bytes)`);

    return {
      filename,
      s3Key,
      s3Bucket: this.bucket,
      contentType: 'application/pdf',
      fileSize: pdfBuffer.length,
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

  private async generatePDF(
    data: Array<Record<string, any>>,
    template: any,
    dataset: any,
    theme: string
  ): Promise<Buffer> {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();

      // Generate HTML content
      const htmlContent = this.generateHTMLContent(data, template, dataset, theme);
      
      // Set content and wait for fonts to load
      await page.setContent(htmlContent, { waitUntil: 'networkidle' });

      // Generate PDF with UTSS styling
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '0.75in',
          right: '0.5in',
          bottom: '0.75in',
          left: '0.5in',
        },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: this.getHeaderTemplate(dataset),
        footerTemplate: this.getFooterTemplate(),
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  private generateHTMLContent(
    data: Array<Record<string, any>>,
    template: any,
    dataset: any,
    theme: string
  ): string {
    // Get target fields that have data
    const targetFields = template.fieldDefs
      .filter((fd: any) => data.some(row => row[fd.targetField] !== null && row[fd.targetField] !== undefined))
      .sort((a: any, b: any) => {
        // Sort by: required first, then alphabetical
        if (a.required !== b.required) return a.required ? -1 : 1;
        return a.targetField.localeCompare(b.targetField);
      });

    // Calculate rows per page (approximately)
    const rowsPerPage = 25;
    const totalPages = Math.ceil(data.length / rowsPerPage);

    let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${dataset.name} - Target Universe</title>
  <style>
    ${this.getUTSSStyles()}
  </style>
</head>
<body>
  <div class="document">
    <!-- Title Section -->
    <div class="title-section">
      <h1 class="document-title">Target Universe</h1>
      <div class="subtitle">${dataset.name}</div>
      <div class="metadata">
        Generated ${new Date().toLocaleDateString()} • ${data.length} Companies • ${totalPages} Pages
      </div>
    </div>

    <!-- Data Table -->
    <table class="data-table">
      <thead>
        <tr class="header-row">
          ${targetFields.map(field => `
            <th class="header-cell ${field.targetField}">
              ${this.formatFieldName(field.targetField)}
              ${field.required ? '<span class="required">*</span>' : ''}
            </th>
          `).join('')}
        </tr>
      </thead>
      <tbody>
        ${data.map((row, index) => `
          <tr class="data-row ${index % 2 === 0 ? 'even' : 'odd'}">
            ${targetFields.map(field => `
              <td class="data-cell ${field.targetField}">
                ${this.formatCellValueForHTML(row[field.targetField], field)}
              </td>
            `).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;

    return html;
  }

  private getUTSSStyles(): string {
    return `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
      
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 9px;
        line-height: 1.4;
        color: #1a202c;
        background: white;
      }

      .document {
        width: 100%;
        max-width: 100%;
      }

      .title-section {
        text-align: center;
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 3px solid #319795;
      }

      .document-title {
        font-size: 24px;
        font-weight: 700;
        color: #1a365d;
        margin-bottom: 8px;
        background: linear-gradient(135deg, #1a365d 0%, #2d4a6b 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .subtitle {
        font-size: 14px;
        font-weight: 500;
        color: #4a5568;
        margin-bottom: 4px;
      }

      .metadata {
        font-size: 10px;
        color: #718096;
      }

      .data-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 16px;
      }

      .header-row {
        background: linear-gradient(135deg, #1a365d 0%, #2d4a6b 100%);
      }

      .header-cell {
        padding: 8px 6px;
        text-align: left;
        font-weight: 600;
        font-size: 8px;
        color: white;
        border: 1px solid #2d4a6b;
        vertical-align: middle;
      }

      .header-cell.rank { width: 6%; text-align: center; }
      .header-cell.companyName { width: 20%; }
      .header-cell.city { width: 12%; }
      .header-cell.state { width: 6%; text-align: center; }
      .header-cell.description { width: 25%; }
      .header-cell.estimatedRevenueMillions { width: 12%; text-align: right; }
      .header-cell.executiveName { width: 15%; }
      .header-cell.executiveTitle { width: 15%; }
      .header-cell.logoUrl { width: 15%; }

      .required {
        color: #e53e3e;
        font-weight: bold;
        margin-left: 2px;
      }

      .data-row.even {
        background-color: #ffffff;
      }

      .data-row.odd {
        background-color: #f7fafc;
      }

      .data-cell {
        padding: 6px 6px;
        border: 1px solid #e2e8f0;
        font-size: 8px;
        vertical-align: top;
        word-wrap: break-word;
      }

      .data-cell.rank { text-align: center; font-weight: 500; }
      .data-cell.companyName { font-weight: 500; color: #1a365d; }
      .data-cell.city { color: #4a5568; }
      .data-cell.state { text-align: center; font-weight: 500; }
      .data-cell.description { font-size: 7px; line-height: 1.3; }
      .data-cell.estimatedRevenueMillions { 
        text-align: right; 
        font-weight: 500; 
        color: #319795; 
      }
      .data-cell.executiveName { color: #2d4a6b; }
      .data-cell.executiveTitle { font-size: 7px; color: #718096; }
      .data-cell.logoUrl { 
        font-size: 7px; 
        word-break: break-all; 
        color: #319795; 
      }

      .empty-cell {
        color: #a0aec0;
        font-style: italic;
      }

      /* Page break handling */
      @media print {
        .data-table {
          page-break-inside: auto;
        }
        
        .data-row {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        
        .header-row {
          page-break-after: avoid;
        }
        
        thead {
          display: table-header-group;
        }
      }

      /* Responsive column adjustments for smaller content */
      @media (max-width: 800px) {
        .header-cell, .data-cell {
          padding: 4px 3px;
          font-size: 7px;
        }
        
        .data-cell.description {
          font-size: 6px;
        }
      }
    `;
  }

  private getHeaderTemplate(dataset: any): string {
    return `
      <div style="font-size: 10px; color: #718096; margin: 0 24px; display: flex; justify-content: space-between; align-items: center; width: calc(100% - 48px);">
        <span>${dataset.name} - Target Universe</span>
        <span>Generated ${new Date().toLocaleDateString()}</span>
      </div>
    `;
  }

  private getFooterTemplate(): string {
    return `
      <div style="font-size: 9px; color: #a0aec0; margin: 0 24px; display: flex; justify-content: space-between; align-items: center; width: calc(100% - 48px);">
        <span>Generated by Edge Scraper Pro</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `;
  }

  private formatFieldName(fieldName: string): string {
    // Convert camelCase to Title Case with proper spacing
    const formatted = fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();

    // Special cases for better readability
    const specialCases: Record<string, string> = {
      'Estimated Revenue Millions': 'Est. Revenue (M)',
      'Executive Name': 'Executive',
      'Executive Title': 'Title',
      'Company Name': 'Company',
      'Logo Url': 'Logo',
    };

    return specialCases[formatted] || formatted;
  }

  private formatCellValueForHTML(value: any, field: any): string {
    if (value === null || value === undefined || value === '') {
      return '<span class="empty-cell">—</span>';
    }

    let formattedValue = value.toString();

    // Format based on field type
    switch (field.targetField) {
      case 'estimatedRevenueMillions':
        if (typeof value === 'number') {
          formattedValue = `$${value.toFixed(1)}M`;
        }
        break;
      
      case 'logoUrl':
        if (formattedValue.startsWith('http')) {
          // Truncate long URLs for display
          if (formattedValue.length > 30) {
            formattedValue = formattedValue.substring(0, 27) + '...';
          }
        }
        break;
      
      case 'description':
        // Truncate long descriptions
        if (formattedValue.length > 120) {
          formattedValue = formattedValue.substring(0, 117) + '...';
        }
        break;
    }

    // HTML escape
    formattedValue = formattedValue
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    return formattedValue;
  }
}
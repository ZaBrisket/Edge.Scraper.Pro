/**
 * Enhanced Exporter with Schema Validation
 * 
 * Exports data in various formats with schema validation
 * and detailed error reporting
 */

import { SchemaValidator, ValidationResult } from '../lib/validation/schema-validator';
import { createLogger } from '../lib/logger';

export interface ExportOptions {
  format: 'json' | 'csv' | 'xlsx';
  schemaName: string;
  validateSchema?: boolean;
  includeMetadata?: boolean;
  includeExtractionInfo?: boolean;
  filename?: string;
}

export interface ExportResult {
  success: boolean;
  data?: string | Buffer;
  filename?: string;
  mimeType?: string;
  validationResult?: ValidationResult;
  error?: string;
  stats?: {
    totalItems: number;
    successfulItems: number;
    failedItems: number;
    validationErrors: number;
    validationWarnings: number;
  };
}

export class EnhancedExporter {
  private validator: SchemaValidator;
  private logger: ReturnType<typeof createLogger>;

  constructor() {
    this.validator = new SchemaValidator();
    this.logger = createLogger('enhanced-exporter');
  }

  /**
   * Export data with schema validation
   */
  async export(data: any, options: ExportOptions): Promise<ExportResult> {
    try {
      this.logger.info({ 
        format: options.format, 
        schemaName: options.schemaName,
        validateSchema: options.validateSchema 
      }, 'Starting data export');

      // Validate schema if requested
      let validationResult: ValidationResult | undefined;
      if (options.validateSchema) {
        validationResult = this.validator.validate(data, options.schemaName);
        
        if (!validationResult.valid) {
          this.logger.warn({ 
            schemaName: options.schemaName,
            errorCount: validationResult.errors.length 
          }, 'Schema validation failed');
        }
      }

      // Transform data based on format
      let exportData: any;
      let mimeType: string;
      let filename: string;

      switch (options.format) {
        case 'json':
          exportData = this.exportAsJson(data, options);
          mimeType = 'application/json';
          filename = options.filename || `${options.schemaName}-${Date.now()}.json`;
          break;
        case 'csv':
          exportData = this.exportAsCsv(data, options);
          mimeType = 'text/csv';
          filename = options.filename || `${options.schemaName}-${Date.now()}.csv`;
          break;
        case 'xlsx':
          exportData = await this.exportAsXlsx(data, options);
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          filename = options.filename || `${options.schemaName}-${Date.now()}.xlsx`;
          break;
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }

      // Calculate statistics
      const stats = this.calculateStats(data, validationResult);

      this.logger.info({ 
        format: options.format,
        filename,
        stats 
      }, 'Data export completed successfully');

      return {
        success: true,
        data: exportData,
        filename,
        mimeType,
        validationResult,
        stats,
      };

    } catch (error) {
      this.logger.error({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        format: options.format,
        schemaName: options.schemaName 
      }, 'Data export failed');

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        validationResult,
      };
    }
  }

  /**
   * Export as JSON
   */
  private exportAsJson(data: any, options: ExportOptions): string {
    const exportData = this.prepareDataForExport(data, options);
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export as CSV
   */
  private exportAsCsv(data: any, options: ExportOptions): string {
    const exportData = this.prepareDataForExport(data, options);
    const items = this.extractItemsFromData(exportData);
    
    if (items.length === 0) {
      return '';
    }

    // Get headers from first item
    const headers = this.getCsvHeaders(items[0], options);
    
    // Create CSV rows
    const rows = items.map(item => 
      headers.map(header => this.getCsvValue(item, header))
    );

    // Escape CSV values
    const escapedRows = rows.map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    );

    return [headers.join(','), ...escapedRows].join('\n');
  }

  /**
   * Export as XLSX
   */
  private async exportAsXlsx(data: any, options: ExportOptions): Promise<Buffer> {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    
    const exportData = this.prepareDataForExport(data, options);
    const items = this.extractItemsFromData(exportData);
    
    if (items.length === 0) {
      return Buffer.from('');
    }

    const worksheet = workbook.addWorksheet('Data');
    const headers = this.getCsvHeaders(items[0], options);
    
    // Add headers
    worksheet.addRow(headers);
    
    // Style headers
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    items.forEach(item => {
      const row = headers.map(header => this.getCsvValue(item, header));
      worksheet.addRow(row);
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = Math.max(column.width || 10, 15);
    });

    return await workbook.xlsx.writeBuffer();
  }

  /**
   * Prepare data for export based on options
   */
  private prepareDataForExport(data: any, options: ExportOptions): any {
    const exportData = { ...data };

    // Remove extraction info if not requested
    if (!options.includeExtractionInfo) {
      this.removeExtractionInfo(exportData);
    }

    // Remove metadata if not requested
    if (!options.includeMetadata) {
      delete exportData.metadata;
    }

    return exportData;
  }

  /**
   * Remove extraction info from all items
   */
  private removeExtractionInfo(data: any): void {
    const items = this.extractItemsFromData(data);
    items.forEach(item => {
      if (item.extractionInfo) {
        delete item.extractionInfo;
      }
    });
  }

  /**
   * Extract items array from data based on schema
   */
  private extractItemsFromData(data: any): any[] {
    if (data.articles) return data.articles;
    if (data.players) return data.players;
    if (data.companies) return data.companies;
    return [];
  }

  /**
   * Get CSV headers based on schema and options
   */
  private getCsvHeaders(sampleItem: any, options: ExportOptions): string[] {
    const headers = ['URL', 'Title', 'Content'];
    
    // Add schema-specific headers
    switch (options.schemaName) {
      case 'news':
        headers.push('Author', 'Published Date', 'Description');
        if (options.includeExtractionInfo) {
          headers.push('Content Length', 'Canonicalized', 'Pagination Discovered');
        }
        break;
      case 'sports':
        headers.push('Sport', 'Team', 'Player', 'Event', 'Date', 'Score');
        if (options.includeExtractionInfo) {
          headers.push('Content Length', 'Canonicalized', 'Pagination Discovered');
        }
        break;
      case 'companies':
        headers.push('Description', 'Industry', 'Size', 'Founded', 'Email', 'Phone', 'Address');
        if (options.includeExtractionInfo) {
          headers.push('Content Length', 'Canonicalized', 'Pagination Discovered');
        }
        break;
    }

    return headers;
  }

  /**
   * Get CSV value for a specific header
   */
  private getCsvValue(item: any, header: string): any {
    switch (header) {
      case 'URL':
        return item.url || item.originalUrl || '';
      case 'Title':
        return item.title || '';
      case 'Content':
        return item.content || '';
      case 'Author':
        return item.author || '';
      case 'Published Date':
        return item.publishedDate || '';
      case 'Description':
        return item.description || '';
      case 'Sport':
        return item.sport || '';
      case 'Team':
        return item.team || '';
      case 'Player':
        return item.player || '';
      case 'Event':
        return item.event || '';
      case 'Date':
        return item.date || '';
      case 'Score':
        return item.score || '';
      case 'Industry':
        return item.industry || '';
      case 'Size':
        return item.size || '';
      case 'Founded':
        return item.founded || '';
      case 'Email':
        return item.contactInfo?.email || '';
      case 'Phone':
        return item.contactInfo?.phone || '';
      case 'Address':
        return item.contactInfo?.address || '';
      case 'Content Length':
        return item.extractionInfo?.contentLength || 0;
      case 'Canonicalized':
        return item.extractionInfo?.canonicalized ? 'Yes' : 'No';
      case 'Pagination Discovered':
        return item.extractionInfo?.paginationDiscovered ? 'Yes' : 'No';
      default:
        return '';
    }
  }

  /**
   * Calculate export statistics
   */
  private calculateStats(data: any, validationResult?: ValidationResult): {
    totalItems: number;
    successfulItems: number;
    failedItems: number;
    validationErrors: number;
    validationWarnings: number;
  } {
    const items = this.extractItemsFromData(data);
    const totalItems = items.length;
    const successfulItems = items.filter((item: any) => 
      item.title && item.content && item.content.length > 500
    ).length;
    const failedItems = totalItems - successfulItems;

    return {
      totalItems,
      successfulItems,
      failedItems,
      validationErrors: validationResult?.errors.length || 0,
      validationWarnings: validationResult?.warnings.length || 0,
    };
  }

  /**
   * Get available export formats
   */
  getAvailableFormats(): string[] {
    return ['json', 'csv', 'xlsx'];
  }

  /**
   * Get available schemas
   */
  getAvailableSchemas(): string[] {
    return this.validator.getAvailableSchemas();
  }
}
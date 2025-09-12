/**
 * Export functionality for supplier directory data
 * Supports CSV and JSON export formats
 */

const fs = require('fs');
const path = require('path');

class SupplierDataExporter {
  constructor() {
    this.supportedFormats = ['json', 'csv'];
  }

  /**
   * Export supplier data to specified format
   * @param {Array} companies - Array of company objects
   * @param {string} outputPath - Output file path
   * @param {Object} options - Export options
   */
  export(companies, outputPath, options = {}) {
    const format = this.getFormatFromPath(outputPath);

    if (!this.supportedFormats.includes(format)) {
      throw new Error(
        `Unsupported format: ${format}. Supported formats: ${this.supportedFormats.join(', ')}`
      );
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    switch (format) {
      case 'json':
        this.exportJSON(companies, outputPath, options);
        break;
      case 'csv':
        this.exportCSV(companies, outputPath, options);
        break;
      default:
        throw new Error(`Export format not implemented: ${format}`);
    }
  }

  /**
   * Export to JSON format
   */
  exportJSON(companies, outputPath, options = {}) {
    const data = {
      metadata: {
        exportedAt: new Date().toISOString(),
        totalCompanies: companies.length,
        format: 'json',
        version: '1.0',
      },
      companies: companies,
    };

    const jsonString = options.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

    fs.writeFileSync(outputPath, jsonString, 'utf8');
  }

  /**
   * Export to CSV format
   */
  exportCSV(companies, outputPath, options = {}) {
    if (companies.length === 0) {
      // Create empty CSV with headers
      const headers = ['Name', 'Contact Information', 'Website'];
      fs.writeFileSync(outputPath, headers.join(',') + '\n', 'utf8');
      return;
    }

    const csvLines = [];

    // Add header
    csvLines.push('Name,Contact Information,Website');

    // Add data rows
    companies.forEach(company => {
      const name = this.escapeCSV(company.name || '');
      const contact = this.escapeCSV(company.contact || '');
      const website = this.escapeCSV(company.website || '');

      csvLines.push(`${name},${contact},${website}`);
    });

    fs.writeFileSync(outputPath, csvLines.join('\n'), 'utf8');
  }

  /**
   * Escape CSV field values
   */
  escapeCSV(value) {
    if (!value) return '';

    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    const escaped = value.replace(/"/g, '""');

    if (
      escaped.includes(',') ||
      escaped.includes('"') ||
      escaped.includes('\n') ||
      escaped.includes('\r')
    ) {
      return `"${escaped}"`;
    }

    return escaped;
  }

  /**
   * Get file format from path extension
   */
  getFormatFromPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.json':
        return 'json';
      case '.csv':
        return 'csv';
      default:
        throw new Error(`Cannot determine format from file extension: ${ext}`);
    }
  }

  /**
   * Export batch processing results
   */
  exportBatchResults(batchResult, outputPath, options = {}) {
    const format = this.getFormatFromPath(outputPath);

    // Extract companies from batch results
    const allCompanies = [];

    if (batchResult.results) {
      batchResult.results.forEach(result => {
        if (result.success && result.data && result.data.companies) {
          allCompanies.push(
            ...result.data.companies.map(company => ({
              ...company,
              sourceUrl: result.url,
              extractedAt: result.data.extractedAt,
            }))
          );
        }
      });
    }

    // Add batch metadata
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        batchId: batchResult.batchId,
        totalUrls: batchResult.stats.totalUrls,
        successfulUrls: batchResult.stats.successfulUrls,
        failedUrls: batchResult.stats.failedUrls,
        totalCompanies: allCompanies.length,
        processingTime: batchResult.stats.duration,
        format: format,
        version: '1.0',
      },
      companies: allCompanies,
    };

    if (format === 'json') {
      const jsonString = options.pretty
        ? JSON.stringify(exportData, null, 2)
        : JSON.stringify(exportData);
      fs.writeFileSync(outputPath, jsonString, 'utf8');
    } else if (format === 'csv') {
      this.exportCSV(allCompanies, outputPath, options);
    }
  }

  /**
   * Create summary report
   */
  createSummaryReport(batchResult, outputPath) {
    const report = {
      summary: {
        batchId: batchResult.batchId,
        exportedAt: new Date().toISOString(),
        totalUrls: batchResult.stats.totalUrls,
        successfulUrls: batchResult.stats.successfulUrls,
        failedUrls: batchResult.stats.failedUrls,
        successRate:
          batchResult.stats.processedUrls > 0
            ? ((batchResult.stats.successfulUrls / batchResult.stats.processedUrls) * 100).toFixed(
                1
              ) + '%'
            : '0%',
        processingTime: batchResult.stats.duration,
        averageProcessingTime: batchResult.stats.averageProcessingTime,
        throughput: batchResult.stats.throughput,
      },
      companies: this.extractCompanySummary(batchResult),
      errors: this.extractErrorSummary(batchResult),
      recommendations: batchResult.errorReport?.recommendations || [],
    };

    const jsonString = JSON.stringify(report, null, 2);
    fs.writeFileSync(outputPath, jsonString, 'utf8');
  }

  /**
   * Extract company summary from batch results
   */
  extractCompanySummary(batchResult) {
    const companiesByUrl = {};
    let totalCompanies = 0;

    if (batchResult.results) {
      batchResult.results.forEach(result => {
        if (result.success && result.data && result.data.companies) {
          companiesByUrl[result.url] = {
            count: result.data.companies.length,
            companies: result.data.companies.map(c => ({
              name: c.name,
              hasContact: !!c.contact,
              hasWebsite: !!c.website,
            })),
          };
          totalCompanies += result.data.companies.length;
        }
      });
    }

    return {
      totalCompanies,
      companiesByUrl,
      averageCompaniesPerUrl:
        batchResult.stats.successfulUrls > 0
          ? (totalCompanies / batchResult.stats.successfulUrls).toFixed(1)
          : 0,
    };
  }

  /**
   * Extract error summary from batch results
   */
  extractErrorSummary(batchResult) {
    const errorsByCategory = {};
    const errorExamples = [];

    if (batchResult.results) {
      batchResult.results.forEach(result => {
        if (!result.success) {
          const category = result.errorCategory || 'unknown';
          errorsByCategory[category] = (errorsByCategory[category] || 0) + 1;

          if (errorExamples.length < 10) {
            errorExamples.push({
              url: result.url,
              error: result.error,
              category: result.errorCategory,
            });
          }
        }
      });
    }

    return {
      totalErrors: batchResult.stats.failedUrls,
      errorsByCategory,
      errorExamples,
    };
  }
}

module.exports = { SupplierDataExporter };

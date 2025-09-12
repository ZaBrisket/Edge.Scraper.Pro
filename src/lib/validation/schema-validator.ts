/**
 * Schema Validator for Export Data
 * 
 * Validates exported data against JSON schemas
 * and provides detailed error reporting
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../logger';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  data?: any;
  schemaPath?: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  data?: any;
}

export class SchemaValidator {
  private ajv: Ajv;
  private logger: ReturnType<typeof createLogger>;
  private schemas: Map<string, any> = new Map();

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
    });
    addFormats(this.ajv);
    this.logger = createLogger('schema-validator');
    this.loadSchemas();
  }

  private loadSchemas(): void {
    const schemaDir = join(process.cwd(), 'schemas', 'exports');
    const schemaFiles = ['news.json', 'sports.json', 'companies.json'];

    for (const schemaFile of schemaFiles) {
      try {
        const schemaPath = join(schemaDir, schemaFile);
        const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
        const schemaName = schemaFile.replace('.json', '');
        
        this.ajv.addSchema(schema, schemaName);
        this.schemas.set(schemaName, schema);
        
        this.logger.debug({ schemaName }, 'Loaded schema');
      } catch (error) {
        this.logger.error({ 
          schemaFile, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }, 'Failed to load schema');
      }
    }
  }

  /**
   * Validate data against a specific schema
   */
  validate(data: any, schemaName: string): ValidationResult {
    const result: ValidationResult = {
      valid: false,
      errors: [],
      warnings: [],
    };

    try {
      const validate = this.ajv.getSchema(schemaName);
      if (!validate) {
        result.errors.push({
          path: '',
          message: `Schema '${schemaName}' not found`,
        });
        return result;
      }

      const valid = validate(data);
      if (!valid) {
        result.errors = (validate.errors || []).map(error => ({
          path: error.instancePath || error.schemaPath || '',
          message: error.message || 'Validation error',
          data: error.data,
          schemaPath: error.schemaPath,
        }));
      } else {
        result.valid = true;
      }

      // Add warnings for potential issues
      this.addWarnings(data, schemaName, result);

      this.logger.debug({ 
        schemaName, 
        valid: result.valid, 
        errorCount: result.errors.length,
        warningCount: result.warnings.length 
      }, 'Schema validation completed');

      return result;

    } catch (error) {
      this.logger.error({ 
        schemaName, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Schema validation failed');

      result.errors.push({
        path: '',
        message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });

      return result;
    }
  }

  /**
   * Add warnings for potential data quality issues
   */
  private addWarnings(data: any, schemaName: string, result: ValidationResult): void {
    if (!data || typeof data !== 'object') return;

    // Check for missing or empty arrays
    if (data.articles && Array.isArray(data.articles) && data.articles.length === 0) {
      result.warnings.push({
        path: 'articles',
        message: 'No articles found in export data',
      });
    }

    if (data.players && Array.isArray(data.players) && data.players.length === 0) {
      result.warnings.push({
        path: 'players',
        message: 'No players found in export data',
      });
    }

    if (data.companies && Array.isArray(data.companies) && data.companies.length === 0) {
      result.warnings.push({
        path: 'companies',
        message: 'No companies found in export data',
      });
    }

    // Check for low content quality
    const items = data.articles || data.players || data.companies || [];
    if (Array.isArray(items)) {
      const lowQualityItems = items.filter((item: any) => 
        item.content && item.content.length < 1000
      );

      if (lowQualityItems.length > 0) {
        result.warnings.push({
          path: 'content',
          message: `${lowQualityItems.length} items have low content quality (< 1000 characters)`,
        });
      }

      // Check for missing required fields
      const missingFields = items.filter((item: any) => 
        !item.title || !item.content
      );

      if (missingFields.length > 0) {
        result.warnings.push({
          path: 'required_fields',
          message: `${missingFields.length} items are missing required fields (title, content)`,
        });
      }
    }

    // Check metadata completeness
    if (data.metadata) {
      const requiredMetadataFields = ['exportedAt', 'totalArticles', 'successfulExtractions', 'failedExtractions'];
      const missingMetadataFields = requiredMetadataFields.filter(field => 
        !data.metadata[field] && data.metadata[field] !== 0
      );

      if (missingMetadataFields.length > 0) {
        result.warnings.push({
          path: 'metadata',
          message: `Missing metadata fields: ${missingMetadataFields.join(', ')}`,
        });
      }
    }
  }

  /**
   * Get available schema names
   */
  getAvailableSchemas(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Get schema by name
   */
  getSchema(schemaName: string): any {
    return this.schemas.get(schemaName);
  }

  /**
   * Validate multiple data sets
   */
  validateMultiple(dataSets: Array<{ data: any; schemaName: string }>): Array<{ schemaName: string; result: ValidationResult }> {
    return dataSets.map(({ data, schemaName }) => ({
      schemaName,
      result: this.validate(data, schemaName),
    }));
  }

  /**
   * Get validation statistics
   */
  getValidationStats(validationResults: Array<{ schemaName: string; result: ValidationResult }>): {
    totalValidations: number;
    validCount: number;
    invalidCount: number;
    totalErrors: number;
    totalWarnings: number;
    errorBreakdown: Record<string, number>;
  } {
    const stats = {
      totalValidations: validationResults.length,
      validCount: 0,
      invalidCount: 0,
      totalErrors: 0,
      totalWarnings: 0,
      errorBreakdown: {} as Record<string, number>,
    };

    for (const { result } of validationResults) {
      if (result.valid) {
        stats.validCount++;
      } else {
        stats.invalidCount++;
      }

      stats.totalErrors += result.errors.length;
      stats.totalWarnings += result.warnings.length;

      for (const error of result.errors) {
        const errorType = error.message.split(':')[0] || 'Unknown';
        stats.errorBreakdown[errorType] = (stats.errorBreakdown[errorType] || 0) + 1;
      }
    }

    return stats;
  }
}
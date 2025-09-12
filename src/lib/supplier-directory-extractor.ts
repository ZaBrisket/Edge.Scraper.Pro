/**
 * TypeScript wrapper for Supplier Directory Content Extractor
 * Provides type definitions for the JavaScript implementation
 */

export interface Company {
  name: string;
  contact?: string;
  website?: string;
  address?: string;
  phone?: string;
  email?: string;
  description?: string;
  category?: string;
  [key: string]: any;
}

export interface ExtractionResult {
  companies: Company[];
  extractedAt: string;
  sourceUrl: string;
  totalFound: number;
  extractionMethod: string;
  confidence: number;
  metadata?: {
    pageTitle?: string;
    pageDescription?: string;
    canonicalUrl?: string;
    [key: string]: any;
  };
}

export interface SupplierDirectoryExtractorOptions {
  enableStructuredData?: boolean;
  enableTableExtraction?: boolean;
  enableListExtraction?: boolean;
  enableTextParsing?: boolean;
  minConfidence?: number;
  maxCompanies?: number;
  debugMode?: boolean;
}

// Import the JavaScript implementation
// @ts-ignore - JavaScript module without types
const SupplierDirectoryExtractorJS = require('./supplier-directory-extractor');

export class SupplierDirectoryExtractor {
  private options: SupplierDirectoryExtractorOptions;

  constructor(options: SupplierDirectoryExtractorOptions = {}) {
    this.options = {
      enableStructuredData: true,
      enableTableExtraction: true,
      enableListExtraction: true,
      enableTextParsing: true,
      minConfidence: 0.5,
      maxCompanies: 1000,
      debugMode: false,
      ...options,
    };
  }

  async extract(document: Document, sourceUrl: string): Promise<ExtractionResult> {
    // Create a new instance of the JavaScript extractor
    const extractor = new SupplierDirectoryExtractorJS.SupplierDirectoryExtractor(this.options);
    
    // Call the extract method
    const result = await extractor.extract(document, sourceUrl);
    
    return result;
  }

  // Delegate other methods to the JavaScript implementation
  setOptions(options: Partial<SupplierDirectoryExtractorOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): SupplierDirectoryExtractorOptions {
    return { ...this.options };
  }
}
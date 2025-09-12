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
export declare class SupplierDirectoryExtractor {
    private options;
    constructor(options?: SupplierDirectoryExtractorOptions);
    extract(document: Document, sourceUrl: string): Promise<ExtractionResult>;
    setOptions(options: Partial<SupplierDirectoryExtractorOptions>): void;
    getOptions(): SupplierDirectoryExtractorOptions;
}
//# sourceMappingURL=supplier-directory-extractor.d.ts.map
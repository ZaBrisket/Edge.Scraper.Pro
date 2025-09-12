/**
 * Common Parsing Utilities
 * Shared parsing functions used across different tasks
 */
export interface ParsedContent {
    title?: string;
    description?: string;
    content?: string;
    author?: string;
    publishedAt?: string;
    modifiedAt?: string;
    tags?: string[];
    images?: Array<{
        src: string;
        alt?: string;
        caption?: string;
    }>;
    metadata?: Record<string, any>;
}
export declare class ContentParser {
    private dom;
    private document;
    constructor(html: string);
    extractTitle(): string | undefined;
    extractDescription(): string | undefined;
    extractContent(maxLength?: number): string | undefined;
    extractAuthor(): string | undefined;
    extractPublishedAt(format?: 'iso' | 'timestamp' | 'human'): string | undefined;
    extractModifiedAt(format?: 'iso' | 'timestamp' | 'human'): string | undefined;
    extractTags(): string[];
    extractImages(baseUrl: string, maxImages?: number): Array<{
        src: string;
        alt?: string;
        caption?: string;
    }>;
    extractLanguage(): string | undefined;
    extractAll(options?: {
        maxContentLength?: number;
        extractImages?: boolean;
        maxImages?: number;
        dateFormat?: 'iso' | 'timestamp' | 'human';
    }): ParsedContent;
    private extractImageCaption;
    private calculateWordCount;
    private formatDate;
}
export declare function createContentParser(html: string): ContentParser;
//# sourceMappingURL=parsers.d.ts.map
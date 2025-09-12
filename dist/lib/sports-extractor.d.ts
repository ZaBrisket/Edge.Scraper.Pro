/**
 * Enhanced Sports Statistics Content Extractor
 * Specialized for extracting structured sports data from Pro Football Reference and similar sites
 */
export interface SportsData {
    playerName?: string;
    position?: string;
    team?: string;
    statistics?: Record<string, any>;
    biographical?: Record<string, any>;
    achievements?: string[];
    rawTables?: string[];
    metadata?: {
        url: string;
        extractedAt: string;
        site: string;
        confidence: number;
    };
}
export declare class SportsContentExtractor {
    private logger;
    extract(document: Document, url: string): Promise<SportsData>;
    private extractSiteFromUrl;
    private extractPlayerName;
    private extractPosition;
    private extractTeam;
    private extractStatistics;
    private extractRawTables;
    private parseTable;
    private getColumnHeader;
    private extractBiographicalData;
    private extractAchievements;
    private calculateConfidence;
}
//# sourceMappingURL=sports-extractor.d.ts.map
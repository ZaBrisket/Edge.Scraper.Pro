/**
 * Enhanced Sports Statistics Content Extractor
 * Specialized for extracting structured sports data from Pro Football Reference and similar sites
 */

import { createLogger } from './logger';

// Sports-specific content selectors organized by priority and type
const SPORTS_SELECTORS = {
  // Player biographical information
  playerBio: [
    '.player-info',
    '.bio',
    '.profile-header',
    '.player-details',
    '[class*="player"][class*="info"]',
    '[class*="player"][class*="bio"]',
    '.stats-header',
    '.necro-jersey',
    '.player-summary',
    '.player-header',
    '.bio-info',
    '[id*="player-info"]',
  ],

  // Statistical tables and data grids
  statisticsTables: [
    '.stats_table',
    '.sortable_stats',
    'table[class*="stats"]',
    'table[id*="stats"]',
    '.data_grid',
    '.stats-container table',
    '.season-stats',
    '.career-stats',
    '.player-stats',
    'table.sortable',
    'table[data-stat]',
    '.table-responsive table',
  ],

  // Career summaries and totals
  careerSummary: [
    '.career-stats',
    '.totals',
    '.career-totals',
    '.career-summary',
    '[class*="career"][class*="summary"]',
    '[class*="career"][class*="total"]',
    '.summary-stats',
    '.aggregate-stats',
    '.lifetime-stats',
  ],

  // FAQ and biographical data sections
  biographicalData: [
    '.question',
    '.faq',
    '.bio-section',
    '.personal-info',
    '[class*="question"]',
    '[class*="faq"]',
    '.player-facts',
    '.vital-stats',
    '.biographical',
    '.profile-data',
  ],

  // Awards and achievements
  achievements: [
    '.awards',
    '.honors',
    '.achievements',
    '.accolades',
    '[class*="award"]',
    '[class*="honor"]',
    '[class*="achievement"]',
    '.pro-bowl',
    '.all-pro',
    '.hall-of-fame',
    '.records',
  ],
};

// Site-specific configurations for major sports reference sites
const SITE_CONFIGS = {
  'pro-football-reference.com': {
    playerPagePattern: '/players/',
    primaryContentSelector: '#content',
    statsTableSelector: '.stats_table',
    playerNameSelector: 'h1[itemprop="name"]',
    positionSelector: '.meta .p1',
    teamSelector: '.meta .p2',
  },
  'basketball-reference.com': {
    playerPagePattern: '/players/',
    primaryContentSelector: '#content',
    statsTableSelector: '.stats_table',
    playerNameSelector: 'h1[itemprop="name"]',
    positionSelector: '.meta .p1',
    teamSelector: '.meta .p2',
  },
  'baseball-reference.com': {
    playerPagePattern: '/players/',
    primaryContentSelector: '#content',
    statsTableSelector: '.stats_table',
    playerNameSelector: 'h1[itemprop="name"]',
    positionSelector: '.meta .p1',
    teamSelector: '.meta .p2',
  },
};

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

export class SportsContentExtractor {
  private logger = createLogger('sports-extractor');

  async extract(document: Document, url: string): Promise<SportsData> {
    try {
      const site = this.extractSiteFromUrl(url);
      const config =
        SITE_CONFIGS[site as keyof typeof SITE_CONFIGS] ||
        SITE_CONFIGS['pro-football-reference.com'];

      this.logger.debug('Extracting sports data', { url, site });

      const data: SportsData = {
        metadata: {
          url,
          extractedAt: new Date().toISOString(),
          site,
          confidence: 0,
        },
      };

      // Extract player information
      data.playerName = this.extractPlayerName(document, config);
      data.position = this.extractPosition(document, config);
      data.team = this.extractTeam(document, config);

      // Extract statistics tables
      data.statistics = this.extractStatistics(document, config);
      data.rawTables = this.extractRawTables(document, config);

      // Extract biographical data
      data.biographical = this.extractBiographicalData(document);

      // Extract achievements
      data.achievements = this.extractAchievements(document);

      // Calculate confidence score
      data.metadata!.confidence = this.calculateConfidence(data);

      this.logger.info('Sports data extracted successfully', {
        url,
        playerName: data.playerName,
        confidence: data.metadata!.confidence,
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to extract sports data', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private extractSiteFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  private extractPlayerName(document: Document, config: any): string | undefined {
    const selectors = [
      config.playerNameSelector,
      'h1[itemprop="name"]',
      '.player-name',
      '.player-title h1',
      'h1.player-name',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        return element.textContent.trim();
      }
    }

    return undefined;
  }

  private extractPosition(document: Document, config: any): string | undefined {
    const selectors = [
      config.positionSelector,
      '.meta .p1',
      '.position',
      '.player-position',
      '[class*="position"]',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        return element.textContent.trim();
      }
    }

    return undefined;
  }

  private extractTeam(document: Document, config: any): string | undefined {
    const selectors = [
      config.teamSelector,
      '.meta .p2',
      '.team',
      '.player-team',
      '[class*="team"]',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) {
        return element.textContent.trim();
      }
    }

    return undefined;
  }

  private extractStatistics(document: Document, config: any): Record<string, any> {
    const statistics: Record<string, any> = {};
    const tables = document.querySelectorAll(config.statsTableSelector || '.stats_table');

    tables.forEach((table, index) => {
      try {
        const tableData = this.parseTable(table as HTMLTableElement);
        if (tableData && Object.keys(tableData).length > 0) {
          statistics[`table_${index}`] = tableData;
        }
      } catch (error) {
        this.logger.warn('Failed to parse statistics table', {
          tableIndex: index,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    return statistics;
  }

  private extractRawTables(document: Document, config: any): string[] {
    const tables = document.querySelectorAll(config.statsTableSelector || '.stats_table');
    const rawTables: string[] = [];

    tables.forEach(table => {
      rawTables.push(table.outerHTML);
    });

    return rawTables;
  }

  private parseTable(table: HTMLTableElement): Record<string, any> {
    const data: Record<string, any> = {};
    const rows = table.querySelectorAll('tr');

    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length === 0) return;

      const rowData: Record<string, any> = {};
      cells.forEach((cell, cellIndex) => {
        const header = this.getColumnHeader(table, cellIndex);
        const value = cell.textContent?.trim();
        if (value) {
          rowData[header] = value;
        }
      });

      if (Object.keys(rowData).length > 0) {
        data[`row_${rowIndex}`] = rowData;
      }
    });

    return data;
  }

  private getColumnHeader(table: HTMLTableElement, columnIndex: number): string {
    // Try to find header in the first row
    const firstRow = table.querySelector('tr');
    if (firstRow) {
      const headerCell = firstRow.children[columnIndex];
      if (headerCell?.textContent?.trim()) {
        return headerCell.textContent.trim();
      }
    }

    // Fallback to column index
    return `column_${columnIndex}`;
  }

  private extractBiographicalData(document: Document): Record<string, any> {
    const biographical: Record<string, any> = {};

    SPORTS_SELECTORS.biographicalData.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element, index) => {
        const text = element.textContent?.trim();
        if (text) {
          biographical[`bio_${selector.replace(/[^a-zA-Z0-9]/g, '_')}_${index}`] = text;
        }
      });
    });

    return biographical;
  }

  private extractAchievements(document: Document): string[] {
    const achievements: string[] = [];

    SPORTS_SELECTORS.achievements.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        const text = element.textContent?.trim();
        if (text) {
          achievements.push(text);
        }
      });
    });

    return achievements;
  }

  private calculateConfidence(data: SportsData): number {
    let confidence = 0;

    // Base confidence for having metadata
    if (data.metadata) confidence += 0.1;

    // Player name adds significant confidence
    if (data.playerName) confidence += 0.3;

    // Statistics tables add confidence
    if (data.statistics && Object.keys(data.statistics).length > 0) {
      confidence += 0.4;
    }

    // Additional data adds smaller amounts
    if (data.position) confidence += 0.1;
    if (data.team) confidence += 0.1;
    if (data.biographical && Object.keys(data.biographical).length > 0) confidence += 0.1;
    if (data.achievements && data.achievements.length > 0) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }
}

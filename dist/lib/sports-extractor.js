"use strict";
/**
 * Enhanced Sports Statistics Content Extractor
 * Specialized for extracting structured sports data from Pro Football Reference and similar sites
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SportsContentExtractor = void 0;
const logger_1 = require("./logger");
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
class SportsContentExtractor {
    constructor() {
        this.logger = (0, logger_1.createLogger)('sports-extractor');
    }
    async extract(document, url) {
        try {
            const site = this.extractSiteFromUrl(url);
            const config = SITE_CONFIGS[site] ||
                SITE_CONFIGS['pro-football-reference.com'];
            this.logger.debug('Extracting sports data', { url, site });
            const data = {
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
            data.metadata.confidence = this.calculateConfidence(data);
            this.logger.info('Sports data extracted successfully', {
                url,
                playerName: data.playerName,
                confidence: data.metadata.confidence,
            });
            return data;
        }
        catch (error) {
            this.logger.error('Failed to extract sports data', {
                url,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }
    extractSiteFromUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        }
        catch {
            return 'unknown';
        }
    }
    extractPlayerName(document, config) {
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
    extractPosition(document, config) {
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
    extractTeam(document, config) {
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
    extractStatistics(document, config) {
        const statistics = {};
        const tables = document.querySelectorAll(config.statsTableSelector || '.stats_table');
        tables.forEach((table, index) => {
            try {
                const tableData = this.parseTable(table);
                if (tableData && Object.keys(tableData).length > 0) {
                    statistics[`table_${index}`] = tableData;
                }
            }
            catch (error) {
                this.logger.warn('Failed to parse statistics table', {
                    tableIndex: index,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        });
        return statistics;
    }
    extractRawTables(document, config) {
        const tables = document.querySelectorAll(config.statsTableSelector || '.stats_table');
        const rawTables = [];
        tables.forEach(table => {
            rawTables.push(table.outerHTML);
        });
        return rawTables;
    }
    parseTable(table) {
        const data = {};
        const rows = table.querySelectorAll('tr');
        rows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll('td, th');
            if (cells.length === 0)
                return;
            const rowData = {};
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
    getColumnHeader(table, columnIndex) {
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
    extractBiographicalData(document) {
        const biographical = {};
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
    extractAchievements(document) {
        const achievements = [];
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
    calculateConfidence(data) {
        let confidence = 0;
        // Base confidence for having metadata
        if (data.metadata)
            confidence += 0.1;
        // Player name adds significant confidence
        if (data.playerName)
            confidence += 0.3;
        // Statistics tables add confidence
        if (data.statistics && Object.keys(data.statistics).length > 0) {
            confidence += 0.4;
        }
        // Additional data adds smaller amounts
        if (data.position)
            confidence += 0.1;
        if (data.team)
            confidence += 0.1;
        if (data.biographical && Object.keys(data.biographical).length > 0)
            confidence += 0.1;
        if (data.achievements && data.achievements.length > 0)
            confidence += 0.1;
        return Math.min(confidence, 1.0);
    }
}
exports.SportsContentExtractor = SportsContentExtractor;
//# sourceMappingURL=sports-extractor.js.map
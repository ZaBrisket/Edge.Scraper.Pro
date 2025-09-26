/**
 * Enhanced Sports Statistics Content Extractor
 * Specialized for extracting structured sports data from Pro Football Reference and similar sites
 */

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
    statsTablesSelector: '.stats_table',
    bioSelector: '.necro-jersey, .player-info',
    excludeSelectors: ['.advertisement', '.social-media', '#header', '#footer'],
    dataPatterns: {
      seasonStats: /^\d{4}.*stats/i,
      careerTotals: /career|total/i,
      biographical: /born|height|weight|college/i,
      playerName: /h1[itemprop="name"]|h1 span/,
      position: /.necro-jersey strong/,
    },
  },
  'basketball-reference.com': {
    playerPagePattern: '/players/',
    primaryContentSelector: '#content',
    statsTablesSelector: '.stats_table',
    bioSelector: '.necro-jersey, .player-info',
    excludeSelectors: ['.advertisement', '.social-media'],
  },
  'baseball-reference.com': {
    playerPagePattern: '/players/',
    primaryContentSelector: '#content',
    statsTablesSelector: '.stats_table',
    bioSelector: '.necro-jersey, .player-info',
    excludeSelectors: ['.advertisement', '.social-media'],
  },
  'hockey-reference.com': {
    playerPagePattern: '/players/',
    primaryContentSelector: '#content',
    statsTablesSelector: '.stats_table',
    bioSelector: '.necro-jersey, .player-info',
    excludeSelectors: ['.advertisement', '.social-media'],
  },
};

// Sports-specific keywords for content validation and scoring
const SPORTS_KEYWORDS = {
  general: [
    'stats',
    'statistics',
    'season',
    'career',
    'games',
    'player',
    'team',
    'league',
    'championship',
    'playoff',
    'record',
    'performance',
    'draft',
  ],
  football: [
    'yards',
    'touchdown',
    'sack',
    'interception',
    'fumble',
    'quarterback',
    'running back',
    'wide receiver',
    'defensive',
    'offensive',
    'nfl',
    'passing',
    'rushing',
    'receiving',
    'tackles',
    'completion',
  ],
  basketball: [
    'points',
    'rebounds',
    'assists',
    'steals',
    'blocks',
    'field goal',
    'three pointer',
    'free throw',
    'minutes',
    'nba',
    'shooting',
  ],
  baseball: [
    'batting average',
    'home runs',
    'rbi',
    'era',
    'strikeouts',
    'walks',
    'hits',
    'runs',
    'stolen bases',
    'mlb',
    'pitcher',
    'batter',
  ],
  hockey: [
    'goals',
    'assists',
    'points',
    'plus minus',
    'penalty minutes',
    'shots',
    'saves',
    'nhl',
    'goalie',
    'forward',
    'defenseman',
  ],
};

/**
 * Enhanced content extraction specifically designed for sports statistics pages
 */
class SportsContentExtractor {
  constructor() {
    this.debug = true;
  }

  /**
   * Main extraction method with sports-specific enhancements
   */
  extractSportsContent(doc, url = '') {
    const siteConfig = this.getSiteConfig(url);
    const extractionResult = this.performMultiPhaseExtraction(doc, siteConfig);

    return {
      content: extractionResult.content,
      structuredData: extractionResult.structuredData,
      method: extractionResult.method,
      score: extractionResult.score,
      debug: extractionResult.debug,
      sportsValidation: this.validateSportsContent(extractionResult.content),
    };
  }

  /**
   * Get site-specific configuration based on URL
   */
  getSiteConfig(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      for (const [domain, config] of Object.entries(SITE_CONFIGS)) {
        // Use exact suffix match to prevent subdomain attacks
        if (hostname === domain || hostname.endsWith('.' + domain)) {
          return { ...config, domain };
        }
      }
    } catch (e) {
      // Invalid URL, use default config
    }

    return SITE_CONFIGS['pro-football-reference.com']; // Default to NFL
  }

  /**
   * Multi-phase extraction process optimized for sports content
   */
  performMultiPhaseExtraction(doc, siteConfig) {
    const docClone = doc.cloneNode(true);

    try {
      // Phase 1: Clean document while preserving sports content
      this.cleanDocumentForSports(docClone, siteConfig);

      // Phase 2: Extract structured sports data
      const structuredData = this.extractStructuredSportsData(docClone, siteConfig);

      // Phase 3: Multi-pass content detection with sports-specific scoring
      const contentResults = this.performSportsContentDetection(docClone, siteConfig);

      // Phase 4: Score and select best content
      const scoredResults = this.scoreSportsContent(contentResults, structuredData);

      // Phase 5: Select and format final content
      const selectedContent = this.selectBestSportsContent(scoredResults);

      return {
        content: this.formatSportsContent(selectedContent, structuredData),
        structuredData,
        method: selectedContent?.source || 'fallback',
        score: selectedContent?.score || 0,
        debug: {
          candidatesFound: contentResults.length,
          structuredDataExtracted: Object.keys(structuredData).length,
          selectedMethod: selectedContent?.source,
          siteConfig: siteConfig.domain,
        },
      };
    } finally {
      // Critical: Clean up DOM clone to prevent memory leaks
      this.cleanupDOMClone(docClone);
    }
  }

  /**
   * Clean up DOM clone to prevent memory leaks
   */
  cleanupDOMClone(docClone) {
    try {
      // Remove all child nodes to break circular references
      while (docClone.firstChild) {
        docClone.removeChild(docClone.firstChild);
      }

      // Clear any remaining references
      if (docClone.textContent !== undefined) {
        docClone.textContent = '';
      }

      // Force garbage collection hint (if available)
      if (typeof global !== 'undefined' && global.gc) {
        global.gc();
      }
    } catch (error) {
      // Silently handle cleanup errors to avoid breaking extraction
      if (this.debug) {
        console.warn('DOM cleanup warning:', error.message);
      }
    }
  }

  /**
   * Clean document while preserving sports-specific content
   */
  cleanDocumentForSports(docClone, siteConfig) {
    // Remove non-content elements but preserve sports tables and data
    const removeSelectors = [
      'script',
      'style',
      'noscript',
      'iframe',
      'object',
      'embed',
      // Navigation and UI elements
      'nav:not([class*="content"]):not([id*="content"])',
      'footer:not([class*="content"]):not([id*="content"])',
      'header:not([class*="content"]):not([id*="content"])',
      'aside:not([class*="content"]):not([class*="stats"])',
      // Ads and social media
      '[class*="advertisement"]',
      '[class*="ads"]',
      '[id*="ads"]',
      '[class*="social"]:not([class*="content"])',
      '[class*="share"]:not([class*="content"])',
      // Site-specific excludes
      ...siteConfig.excludeSelectors,
    ];

    removeSelectors.forEach(selector => {
      try {
        docClone.querySelectorAll(selector).forEach(el => el.remove());
      } catch (e) {
        // Continue if selector fails
      }
    });
  }

  /**
   * Extract structured sports data (tables, player info, etc.)
   */
  extractStructuredSportsData(docClone, siteConfig) {
    const structuredData = {
      player: {},
      statistics: {
        career: {},
        seasons: [],
        playoffs: {},
      },
      achievements: [],
      transactions: [],
    };

    try {
      // Extract player biographical information
      structuredData.player = this.extractPlayerBiography(docClone, siteConfig);

      // Extract statistical tables
      const statsTables = this.extractStatisticalTables(docClone, siteConfig);
      structuredData.statistics = { ...structuredData.statistics, ...statsTables };

      // Extract achievements and awards
      structuredData.achievements = this.extractAchievements(docClone);

      // Extract FAQ/biographical data
      const faqData = this.extractFAQData(docClone);
      structuredData.player = { ...structuredData.player, ...faqData };

      return structuredData;
    } catch (error) {
      // Return partial data on error to prevent complete failure
      if (this.debug) {
        console.warn('Error in structured data extraction:', error.message);
      }
      return structuredData;
    }
  }

  /**
   * Extract player biographical information
   */
  extractPlayerBiography(docClone, siteConfig) {
    const bio = {};

    // Extract player name
    const nameSelectors = ['h1[itemprop="name"]', 'h1 span', 'h1', '.player-name'];
    for (const selector of nameSelectors) {
      const nameEl = docClone.querySelector(selector);
      if (nameEl && nameEl.textContent.trim()) {
        bio.name = nameEl.textContent.trim();
        break;
      }
    }

    // Extract position and jersey number
    const jerseyEl = docClone.querySelector('.necro-jersey, .player-position');
    if (jerseyEl) {
      const jerseyText = jerseyEl.textContent;
      const positionMatch = jerseyText.match(/([A-Z]{1,3})\s*(?:#(\d+))?/);
      if (positionMatch) {
        bio.position = positionMatch[1];
        if (positionMatch[2]) bio.jerseyNumber = positionMatch[2];
      }
    }

    // Extract physical stats and biographical data
    const bioSelectors = SPORTS_SELECTORS.playerBio.concat(SPORTS_SELECTORS.biographicalData);
    for (const selector of bioSelectors) {
      try {
        const bioElements = docClone.querySelectorAll(selector);
        bioElements.forEach(el => {
          const text = el.textContent;

          // Height and weight
          const heightMatch = text.match(/(?:Height|Ht):\s*(\d+'\s*\d+"?)/i);
          if (heightMatch) bio.height = heightMatch[1];

          const weightMatch = text.match(/(?:Weight|Wt):\s*(\d+)\s*lbs?/i);
          if (weightMatch) bio.weight = `${weightMatch[1]} lbs`;

          // Birth date and location
          const birthMatch = text.match(/Born:\s*([^,]+),?\s*(.+)/i);
          if (birthMatch) {
            bio.birthDate = birthMatch[1].trim();
            bio.birthPlace = birthMatch[2].trim();
          }

          // College
          const collegeMatch = text.match(/College:\s*([^\n]+)/i);
          if (collegeMatch) bio.college = collegeMatch[1].trim();

          // Draft information
          const draftMatch = text.match(/Draft:\s*(\d{4}).*?(\w+).*?(\d+).*?(\d+)/i);
          if (draftMatch) {
            bio.draft = {
              year: parseInt(draftMatch[1]),
              team: draftMatch[2],
              round: parseInt(draftMatch[3]),
              pick: parseInt(draftMatch[4]),
            };
          }
        });
      } catch (e) {
        // Continue if selector fails
      }
    }

    return bio;
  }

  /**
   * Extract statistical tables and convert to structured data
   */
  extractStatisticalTables(docClone, siteConfig) {
    const statistics = { career: {}, seasons: [], playoffs: {} };

    const tableSelectors = SPORTS_SELECTORS.statisticsTables;
    const tables = [];

    tableSelectors.forEach(selector => {
      try {
        const foundTables = Array.from(docClone.querySelectorAll(selector));
        tables.push(...foundTables.map(table => ({ element: table, selector })));
      } catch (e) {
        // Continue if selector fails
      }
    });

    tables.forEach(({ element: table, selector }) => {
      try {
        const tableData = this.parseStatisticalTable(table);
        if (tableData && tableData.rows.length > 0) {
          // Determine table type based on headers and content
          const tableType = this.classifyStatisticalTable(tableData, table);

          switch (tableType) {
            case 'season':
              statistics.seasons.push(...tableData.rows);
              break;
            case 'career':
              statistics.career = tableData.rows[0] || {};
              break;
            case 'playoffs':
              statistics.playoffs = tableData.rows[0] || {};
              break;
          }
        }
      } catch (e) {
        if (this.debug) console.debug('Error parsing table:', e.message);
      }
    });

    return statistics;
  }

  /**
   * Parse a statistical table into structured data
   */
  parseStatisticalTable(table) {
    const headers = [];
    const rows = [];

    // Extract headers
    const headerRow = table.querySelector('thead tr, tr:first-child');
    if (headerRow) {
      const headerCells = headerRow.querySelectorAll('th, td');
      headerCells.forEach(cell => {
        headers.push(cell.textContent.trim());
      });
    }

    // Extract data rows
    const dataRows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
    dataRows.forEach(row => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length === 0) return;

      const rowData = {};
      cells.forEach((cell, index) => {
        const header = headers[index] || `column_${index}`;
        let value = cell.textContent.trim();

        // Try to convert numeric values
        if (value && !isNaN(value) && value !== '') {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            value = numValue;
          }
        }

        rowData[header] = value;
      });

      if (Object.keys(rowData).length > 0) {
        rows.push(rowData);
      }
    });

    return { headers, rows };
  }

  /**
   * Classify a statistical table by type (season, career, playoffs, etc.)
   */
  classifyStatisticalTable(tableData, tableElement) {
    const tableText = tableElement.textContent.toLowerCase();
    const tableId = tableElement.id?.toLowerCase() || '';
    const tableClass = tableElement.className?.toLowerCase() || '';

    // Check for career/totals indicators
    if (
      tableText.includes('career') ||
      tableText.includes('total') ||
      tableId.includes('career') ||
      tableClass.includes('career') ||
      tableId.includes('total') ||
      tableClass.includes('total')
    ) {
      return 'career';
    }

    // Check for playoff indicators
    if (
      tableText.includes('playoff') ||
      tableText.includes('postseason') ||
      tableId.includes('playoff') ||
      tableClass.includes('playoff')
    ) {
      return 'playoffs';
    }

    // Check if it has year columns (season-by-season data)
    const hasYearColumn = tableData.headers.some(header => /year|season|\d{4}/i.test(header));

    if (hasYearColumn) {
      return 'season';
    }

    return 'general';
  }

  /**
   * Extract achievements and awards
   */
  extractAchievements(docClone) {
    const achievements = [];

    SPORTS_SELECTORS.achievements.forEach(selector => {
      try {
        const elements = docClone.querySelectorAll(selector);
        elements.forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length > 5) {
            // Extract individual achievements
            const achievementList = text
              .split(/[,;]|\n/)
              .map(a => a.trim())
              .filter(a => a.length > 3);
            achievements.push(...achievementList);
          }
        });
      } catch (e) {
        // Continue if selector fails
      }
    });

    return [...new Set(achievements)]; // Remove duplicates
  }

  /**
   * Extract FAQ and biographical data sections
   */
  extractFAQData(docClone) {
    const faqData = {};

    SPORTS_SELECTORS.biographicalData.forEach(selector => {
      try {
        const elements = docClone.querySelectorAll(selector);
        elements.forEach(el => {
          const text = el.textContent;

          // Look for question-answer patterns
          const qaMatches = text.match(/([^?]+\?)\s*([^?]+?)(?=\s*[^?]*\?|$)/g);
          if (qaMatches) {
            qaMatches.forEach(qa => {
              const [question, answer] = qa.split('?').map(s => s.trim());
              if (question && answer) {
                faqData[question] = answer;
              }
            });
          }
        });
      } catch (e) {
        // Continue if selector fails
      }
    });

    return faqData;
  }

  /**
   * Perform sports-specific content detection
   */
  performSportsContentDetection(docClone, siteConfig) {
    const contentResults = [];

    // Pass 1: Sports-specific semantic selectors
    const sportsSemanticSelectors = [
      siteConfig.primaryContentSelector,
      'main',
      'article',
      '[role="main"]',
      '[role="article"]',
      '.player-page',
      '.stats-page',
      '.player-content',
    ];
    contentResults.push(
      ...this.findContentBySelectors(docClone, sportsSemanticSelectors, 'sports-semantic')
    );

    // Pass 2: Sports content containers
    const allSportsSelectors = [
      ...SPORTS_SELECTORS.playerBio,
      ...SPORTS_SELECTORS.statisticsTables,
      ...SPORTS_SELECTORS.careerSummary,
      ...SPORTS_SELECTORS.biographicalData,
    ];
    contentResults.push(
      ...this.findContentBySelectors(docClone, allSportsSelectors, 'sports-specific')
    );

    // Pass 3: General content selectors with sports weighting
    const generalSelectors = [
      '[class*="content"]',
      '[class*="article"]',
      '[class*="story"]',
      '[class*="post"]',
      '[id*="content"]',
      '[id*="article"]',
      '[id*="story"]',
      '[id*="post"]',
      '.main-content',
      '.primary-content',
      '.page-content',
      '.site-content',
    ];
    contentResults.push(
      ...this.findContentBySelectors(docClone, generalSelectors, 'general-content')
    );

    // Pass 4: Fallback to largest text containers
    const textContainers = Array.from(docClone.querySelectorAll('div, section, article')).filter(
      el => el.innerText && el.innerText.trim().length > 100
    );
    contentResults.push(...textContainers.map(el => ({ element: el, source: 'text-container' })));

    return contentResults;
  }

  /**
   * Find content elements using selectors
   */
  findContentBySelectors(docClone, selectors, source) {
    const results = [];
    for (const selector of selectors) {
      try {
        const elements = Array.from(docClone.querySelectorAll(selector));
        results.push(...elements.map(el => ({ element: el, source })));
      } catch (e) {
        // Continue if selector fails
      }
    }
    return results;
  }

  /**
   * Score content with sports-specific criteria
   */
  scoreSportsContent(contentResults, structuredData) {
    return contentResults
      .filter(result => result.element && result.element.innerText)
      .map(result => ({
        ...result,
        score: this.calculateSportsContentScore(result.element, result.source, structuredData),
        text: result.element.innerText.trim(),
      }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate content score with sports-specific weighting
   */
  calculateSportsContentScore(element, source, structuredData) {
    if (!element || !element.innerText) return 0;

    const text = element.innerText.trim();
    const textLength = text.length;
    if (textLength < 50) return 0;

    // Base scoring from original algorithm
    let baseScore = this.calculateBaseContentScore(element);

    // Sports-specific bonuses
    let sportsBonus = 0;

    // Source-based bonuses
    const sourceBonuses = {
      'sports-semantic': 200,
      'sports-specific': 150,
      'general-content': 50,
      'text-container': 10,
    };
    sportsBonus += sourceBonuses[source] || 0;

    // Sports keyword density bonus
    const sportsKeywordScore = this.calculateSportsKeywordScore(text);
    sportsBonus += sportsKeywordScore;

    // Table presence bonus
    const tableCount = element.querySelectorAll('table').length;
    sportsBonus += Math.min(tableCount * 100, 500);

    // Structured data correlation bonus
    if (structuredData.player.name && text.includes(structuredData.player.name)) {
      sportsBonus += 100;
    }

    // Statistical data patterns bonus
    const statPatterns = [
      /\d+\s*(yards|points|touchdowns|sacks|tackles|assists|rebounds)/gi,
      /\d{4}\s*season/gi,
      /(career|season|playoff)\s*stats/gi,
    ];

    statPatterns.forEach(pattern => {
      const matches = (text.match(pattern) || []).length;
      sportsBonus += Math.min(matches * 20, 200);
    });

    return baseScore + sportsBonus;
  }

  /**
   * Calculate sports keyword density score
   */
  calculateSportsKeywordScore(text) {
    const lowerText = text.toLowerCase();
    let keywordScore = 0;

    // Check all sports keyword categories
    Object.values(SPORTS_KEYWORDS).forEach(keywords => {
      keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = (lowerText.match(regex) || []).length;
        keywordScore += matches * 5; // 5 points per keyword match
      });
    });

    return Math.min(keywordScore, 300); // Cap at 300 points
  }

  /**
   * Calculate base content score (from original algorithm)
   */
  calculateBaseContentScore(element) {
    const text = element.innerText.trim();
    const textLength = text.length;
    const words = text.split(/\s+/);
    const wordCount = words.length;

    // Basic quality metrics
    const linkCount = element.querySelectorAll('a').length;
    const paragraphCount = element.querySelectorAll('p').length;
    const headingCount = element.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
    const listCount = element.querySelectorAll('ul, ol').length;

    // Structure scoring
    let structureScore = 0;
    structureScore += paragraphCount * 30;
    structureScore += headingCount * 80;
    structureScore += listCount * 20;

    // Text quality scoring
    let qualityScore = 0;
    qualityScore += textLength * 0.5;
    qualityScore += Math.min(wordCount * 2, 1000);

    // Link density penalty
    const linkDensity = linkCount / (wordCount + 1);
    const linkPenalty = linkDensity > 0.1 ? (linkDensity - 0.1) * 500 : 0;

    return Math.max(0, structureScore + qualityScore - linkPenalty);
  }

  /**
   * Select the best sports content from scored results
   */
  selectBestSportsContent(scoredResults) {
    if (scoredResults.length === 0) return null;

    const minContentThreshold = 200; // Minimum characters for sports content

    // First try to find substantial sports content
    for (const result of scoredResults) {
      if (
        result.text.length >= minContentThreshold &&
        this.validateSportsContentQuality(result.element)
      ) {
        return result;
      }
    }

    // Fallback to any decent content
    return scoredResults.find(r => r.text.length >= 100) || scoredResults[0];
  }

  /**
   * Validate sports content quality
   */
  validateSportsContentQuality(element) {
    if (!element || !element.innerText) return false;

    const text = element.innerText.trim();
    const words = text.split(/\s+/);

    // Basic quality checks
    if (words.length < 20) return false;

    // Sports-specific validation
    const hasSportsKeywords = this.calculateSportsKeywordScore(text) > 0;
    const hasNumbers = /\d/.test(text);
    const hasStatisticalPatterns = /\d+\s*(yards|points|games|season)/i.test(text);

    return hasSportsKeywords && (hasNumbers || hasStatisticalPatterns);
  }

  /**
   * Format final sports content with structured data integration
   */
  formatSportsContent(selectedContent, structuredData) {
    if (!selectedContent) return '';

    let content = selectedContent.text;

    // Add structured data summary at the beginning if substantial
    if (structuredData.player.name) {
      let summary = `\n=== PLAYER INFORMATION ===\n`;

      if (structuredData.player.name) summary += `Name: ${structuredData.player.name}\n`;
      if (structuredData.player.position)
        summary += `Position: ${structuredData.player.position}\n`;
      if (structuredData.player.height) summary += `Height: ${structuredData.player.height}\n`;
      if (structuredData.player.weight) summary += `Weight: ${structuredData.player.weight}\n`;
      if (structuredData.player.college) summary += `College: ${structuredData.player.college}\n`;

      if (structuredData.achievements.length > 0) {
        summary += `\nAchievements: ${structuredData.achievements.slice(0, 5).join(', ')}\n`;
      }

      summary += `\n=== CONTENT ===\n`;
      content = summary + content;
    }

    // Clean up the content
    return this.cleanFinalContent(content);
  }

  /**
   * Clean and structure the final extracted content
   */
  cleanFinalContent(text) {
    if (!text) return '';

    return text
      .replace(/[\r\n\t]+/g, '\n')
      .replace(/[ \u00A0]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();
  }

  /**
   * Validate if content contains sports-specific information
   */
  validateSportsContent(content) {
    if (!content) return { isValid: false, score: 0, reasons: ['No content'] };

    const validationRules = {
      hasPlayerName: content => /^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(content),
      hasStats: content =>
        /\d+\s*(yards|points|touchdowns|sacks|tackles|assists|rebounds)/i.test(content),
      hasSeasons: content => /20\d{2}|19\d{2}/.test(content),
      hasBiography: content => /born|height|weight|college/i.test(content),
      hasSportsKeywords: content => this.calculateSportsKeywordScore(content) > 20,
      hasNumericalData: content => /\d+/.test(content),
    };

    const results = {};
    let score = 0;

    Object.entries(validationRules).forEach(([rule, test]) => {
      const passed = test(content);
      results[rule] = passed;
      if (passed) score += 1;
    });

    const isValid = score >= 3; // Need at least 3 validation rules to pass
    const reasons = Object.entries(results)
      .filter(([_, passed]) => !passed)
      .map(([rule, _]) => rule);

    return { isValid, score, results, reasons };
  }
}

module.exports = { SportsContentExtractor, SPORTS_SELECTORS, SITE_CONFIGS };

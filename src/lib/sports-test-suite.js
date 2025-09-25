/**
 * Comprehensive Test Suite for Sports Statistics Scraper
 * Tests extraction accuracy, data quality, and export functionality
 */

const { SportsContentExtractor } = require('./sports-extractor');
const { SportsDataExporter } = require('./sports-export');

/**
 * Test data with known NFL player pages for validation
 */
const TEST_PLAYER_URLS = [
  // Active players
  'https://www.pro-football-reference.com/players/M/MahoPa00.htm', // Patrick Mahomes (QB)
  'https://www.pro-football-reference.com/players/A/AlleJo02.htm', // Josh Allen (QB)
  'https://www.pro-football-reference.com/players/H/HenrDe00.htm', // Derrick Henry (RB)
  'https://www.pro-football-reference.com/players/K/KelcTr00.htm', // Travis Kelce (TE)
  'https://www.pro-football-reference.com/players/D/DonaTa01.htm', // Tua Tagovailoa (QB)

  // Retired legends
  'https://www.pro-football-reference.com/players/B/BradTo00.htm', // Tom Brady (QB)
  'https://www.pro-football-reference.com/players/M/MannPe00.htm', // Peyton Manning (QB)
  'https://www.pro-football-reference.com/players/R/RiceJe00.htm', // Jerry Rice (WR)
  'https://www.pro-football-reference.com/players/S/SmitEm00.htm', // Emmitt Smith (RB)
  'https://www.pro-football-reference.com/players/L/LawrTa00.htm', // Lawrence Taylor (LB)

  // Different positions
  'https://www.pro-football-reference.com/players/T/TuckJu99.htm', // Justin Tucker (K)
  'https://www.pro-football-reference.com/players/W/WattT.00.htm', // T.J. Watt (LB)
  'https://www.pro-football-reference.com/players/D/DonaDa00.htm', // Aaron Donald (DT)
];

/**
 * Expected data patterns for validation
 */
const EXPECTED_DATA_PATTERNS = {
  playerBio: {
    name: /^[A-Z][a-z]+\s+[A-Z][a-z]+/,
    position: /^[A-Z]{1,3}$/,
    height: /^\d+'\s*\d+"?$/,
    weight: /^\d+\s*lbs?$/,
    college: /^[A-Za-z\s&-]+$/,
  },
  statistics: {
    hasCareerStats: stats => Object.keys(stats.career || {}).length > 0,
    hasSeasonStats: stats => (stats.seasons || []).length > 0,
    hasNumericalData: stats => {
      const allStats = { ...stats.career, ...stats.playoffs };
      return Object.values(allStats).some(val => typeof val === 'number');
    },
  },
  content: {
    minLength: 500,
    hasSportsKeywords: /\b(stats|statistics|season|career|games|yards|touchdowns?|points?)\b/i,
    hasYears: /\b(19|20)\d{2}\b/,
    hasNumbers: /\d+/,
  },
};

/**
 * Comprehensive sports scraper test suite
 */
class SportsScraperTestSuite {
  constructor() {
    this.extractor = new SportsContentExtractor();
    this.exporter = new SportsDataExporter();
    this.testResults = [];
  }

  /**
   * Run complete test suite
   */
  async runFullTestSuite() {
    console.info('🏈 Starting Sports Scraper Test Suite...\n');

    const startTime = Date.now();
    const results = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      details: {},
      performance: {},
      recommendations: [],
    };

    try {
      // Test 1: Content Extraction Accuracy
      console.info('📊 Testing Content Extraction Accuracy...');
      results.details.extractionAccuracy = await this.testExtractionAccuracy();

      // Test 2: Structured Data Quality
      console.info('🔍 Testing Structured Data Quality...');
      results.details.structuredDataQuality = await this.testStructuredDataQuality();

      // Test 3: Sports-Specific Validation
      console.info('⚡ Testing Sports Validation...');
      results.details.sportsValidation = await this.testSportsValidation();

      // Test 4: Export Functionality
      console.info('📤 Testing Export Functionality...');
      results.details.exportFunctionality = await this.testExportFunctionality();

      // Test 5: Performance Benchmarks
      console.info('🚀 Running Performance Benchmarks...');
      results.details.performance = await this.testPerformance();

      // Test 6: Edge Cases and Error Handling
      console.info('🛡️ Testing Edge Cases...');
      results.details.edgeCases = await this.testEdgeCases();

      // Compile overall results
      results.totalTests = Object.values(results.details).reduce(
        (sum, test) => sum + test.totalTests,
        0
      );
      results.passed = Object.values(results.details).reduce((sum, test) => sum + test.passed, 0);
      results.failed = results.totalTests - results.passed;

      results.performance.totalTime = Date.now() - startTime;
      results.performance.averageTimePerTest = results.performance.totalTime / results.totalTests;

      // Generate recommendations
      results.recommendations = this.generateRecommendations(results);

      this.printTestResults(results);
      return results;
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      return { error: error.message, results };
    }
  }

  /**
   * Test content extraction accuracy on known player pages
   */
  async testExtractionAccuracy() {
    const testResults = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      details: [],
    };

    // Test with mock HTML data (since we can't make actual HTTP requests in this context)
    const mockPlayerPages = this.generateMockPlayerPages();

    for (const mockPage of mockPlayerPages) {
      testResults.totalTests++;

      try {
        const doc = new DOMParser().parseFromString(mockPage.html, 'text/html');
        const extractionResult = this.extractor.extractSportsContent(doc, mockPage.url);

        const accuracy = this.assessExtractionAccuracy(extractionResult, mockPage.expected);

        if (accuracy.score >= 70) {
          testResults.passed++;
        } else {
          testResults.failed++;
        }

        testResults.details.push({
          url: mockPage.url,
          accuracy: accuracy.score,
          issues: accuracy.issues,
          extractedData: {
            contentLength: extractionResult.content.length,
            playerName: extractionResult.structuredData.player.name,
            position: extractionResult.structuredData.player.position,
            statsFound: Object.keys(extractionResult.structuredData.statistics.career || {}).length,
          },
        });
      } catch (error) {
        testResults.failed++;
        testResults.details.push({
          url: mockPage.url,
          error: error.message,
          accuracy: 0,
        });
      }
    }

    return testResults;
  }

  /**
   * Test structured data extraction quality
   */
  async testStructuredDataQuality() {
    const testResults = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      details: [],
    };

    const mockPlayerPages = this.generateMockPlayerPages();

    for (const mockPage of mockPlayerPages) {
      testResults.totalTests++;

      try {
        const doc = new DOMParser().parseFromString(mockPage.html, 'text/html');
        const extractionResult = this.extractor.extractSportsContent(doc, mockPage.url);
        const structuredData = extractionResult.structuredData;

        const qualityScore = this.assessStructuredDataQuality(structuredData, mockPage.expected);

        if (qualityScore >= 60) {
          testResults.passed++;
        } else {
          testResults.failed++;
        }

        testResults.details.push({
          url: mockPage.url,
          qualityScore,
          playerDataCompleteness: this.calculatePlayerDataCompleteness(structuredData.player),
          statisticsAvailable: {
            career: Object.keys(structuredData.statistics.career || {}).length,
            seasons: (structuredData.statistics.seasons || []).length,
            playoffs: Object.keys(structuredData.statistics.playoffs || {}).length,
          },
          achievementsCount: (structuredData.achievements || []).length,
        });
      } catch (error) {
        testResults.failed++;
        testResults.details.push({
          url: mockPage.url,
          error: error.message,
          qualityScore: 0,
        });
      }
    }

    return testResults;
  }

  /**
   * Test sports-specific content validation
   */
  async testSportsValidation() {
    const testResults = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      details: [],
    };

    const mockPlayerPages = this.generateMockPlayerPages();

    for (const mockPage of mockPlayerPages) {
      testResults.totalTests++;

      try {
        const doc = new DOMParser().parseFromString(mockPage.html, 'text/html');
        const extractionResult = this.extractor.extractSportsContent(doc, mockPage.url);
        const validation = extractionResult.sportsValidation;

        if (validation.isValid && validation.score >= 4) {
          testResults.passed++;
        } else {
          testResults.failed++;
        }

        testResults.details.push({
          url: mockPage.url,
          isValid: validation.isValid,
          validationScore: validation.score,
          passedRules: Object.entries(validation.results)
            .filter(([_, passed]) => passed)
            .map(([rule, _]) => rule),
          failedRules: validation.reasons,
        });
      } catch (error) {
        testResults.failed++;
        testResults.details.push({
          url: mockPage.url,
          error: error.message,
          isValid: false,
          validationScore: 0,
        });
      }
    }

    return testResults;
  }

  /**
   * Test export functionality with different formats
   */
  async testExportFunctionality() {
    const testResults = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      details: [],
    };

    // Generate mock scrape results
    const mockScrapeResults = this.generateMockScrapeResults();
    const exportFormats = ['enhanced-csv', 'structured-json', 'player-database'];

    for (const format of exportFormats) {
      testResults.totalTests++;

      try {
        const exportedData = this.exporter.exportSportsData(mockScrapeResults, format);

        const validationResult = this.validateExportFormat(exportedData, format);

        if (validationResult.isValid) {
          testResults.passed++;
        } else {
          testResults.failed++;
        }

        testResults.details.push({
          format,
          isValid: validationResult.isValid,
          dataSize: exportedData.length,
          issues: validationResult.issues,
          sampleData: exportedData.substring(0, 200) + '...',
        });
      } catch (error) {
        testResults.failed++;
        testResults.details.push({
          format,
          error: error.message,
          isValid: false,
        });
      }
    }

    return testResults;
  }

  /**
   * Test performance benchmarks
   */
  async testPerformance() {
    const performanceResults = {
      extractionSpeed: [],
      memoryUsage: [],
      scalability: {},
    };

    const mockPlayerPages = this.generateMockPlayerPages();

    // Test extraction speed
    for (const mockPage of mockPlayerPages) {
      const startTime = performance.now();
      const doc = new DOMParser().parseFromString(mockPage.html, 'text/html');
      this.extractor.extractSportsContent(doc, mockPage.url);
      const endTime = performance.now();

      performanceResults.extractionSpeed.push({
        url: mockPage.url,
        timeMs: endTime - startTime,
        contentSize: mockPage.html.length,
      });
    }

    // Calculate average performance
    performanceResults.averageExtractionTime =
      performanceResults.extractionSpeed.reduce((sum, test) => sum + test.timeMs, 0) /
      performanceResults.extractionSpeed.length;

    // Test scalability with batch processing
    const batchSizes = [1, 5, 10, 25];
    for (const batchSize of batchSizes) {
      const startTime = performance.now();

      for (let i = 0; i < batchSize; i++) {
        const mockPage = mockPlayerPages[i % mockPlayerPages.length];
        const doc = new DOMParser().parseFromString(mockPage.html, 'text/html');
        this.extractor.extractSportsContent(doc, mockPage.url);
      }

      const endTime = performance.now();
      performanceResults.scalability[`batch_${batchSize}`] = {
        totalTime: endTime - startTime,
        averagePerPage: (endTime - startTime) / batchSize,
      };
    }

    return performanceResults;
  }

  /**
   * Test edge cases and error handling
   */
  async testEdgeCases() {
    const testResults = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      details: [],
    };

    const edgeCases = [
      {
        name: 'empty_document',
        html: '<html><body></body></html>',
        url: 'https://www.pro-football-reference.com/players/test.htm',
      },
      {
        name: 'malformed_html',
        html: '<html><body><div class="player-info">Incomplete',
        url: 'https://www.pro-football-reference.com/players/test.htm',
      },
      {
        name: 'non_sports_content',
        html: '<html><body><div>This is not sports content at all. Just regular text.</div></body></html>',
        url: 'https://example.com/not-sports',
      },
      {
        name: 'missing_critical_elements',
        html: '<html><body><div class="content">Some content without player info or stats</div></body></html>',
        url: 'https://www.pro-football-reference.com/players/test.htm',
      },
    ];

    for (const edgeCase of edgeCases) {
      testResults.totalTests++;

      try {
        const doc = new DOMParser().parseFromString(edgeCase.html, 'text/html');
        const extractionResult = this.extractor.extractSportsContent(doc, edgeCase.url);

        // Edge cases should handle gracefully without throwing errors
        const handledGracefully =
          extractionResult.content !== undefined && extractionResult.structuredData !== undefined;

        if (handledGracefully) {
          testResults.passed++;
        } else {
          testResults.failed++;
        }

        testResults.details.push({
          name: edgeCase.name,
          handledGracefully,
          contentExtracted: extractionResult.content.length,
          structuredDataFound: Object.keys(extractionResult.structuredData.player || {}).length > 0,
        });
      } catch (error) {
        testResults.failed++;
        testResults.details.push({
          name: edgeCase.name,
          error: error.message,
          handledGracefully: false,
        });
      }
    }

    return testResults;
  }

  /**
   * Generate mock player pages for testing
   */
  generateMockPlayerPages() {
    return [
      {
        url: 'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
        html: this.generateMockNFLPlayerHTML('Patrick Mahomes', 'QB', 'Kansas City Chiefs'),
        expected: {
          name: 'Patrick Mahomes',
          position: 'QB',
          team: 'Kansas City Chiefs',
        },
      },
      {
        url: 'https://www.pro-football-reference.com/players/H/HenrDe00.htm',
        html: this.generateMockNFLPlayerHTML('Derrick Henry', 'RB', 'Tennessee Titans'),
        expected: {
          name: 'Derrick Henry',
          position: 'RB',
          team: 'Tennessee Titans',
        },
      },
      {
        url: 'https://www.pro-football-reference.com/players/B/BradTo00.htm',
        html: this.generateMockNFLPlayerHTML('Tom Brady', 'QB', 'Tampa Bay Buccaneers', true),
        expected: {
          name: 'Tom Brady',
          position: 'QB',
          team: 'Tampa Bay Buccaneers',
          retired: true,
        },
      },
    ];
  }

  /**
   * Generate mock NFL player HTML
   */
  generateMockNFLPlayerHTML(name, position, team, retired = false) {
    return `
        <html>
        <head><title>${name} Stats | Pro Football Reference</title></head>
        <body>
            <div id="content">
                <h1 itemprop="name">${name}</h1>
                <div class="necro-jersey">
                    <strong>${position}</strong> #12
                </div>
                <div class="player-info">
                    <p>Height: 6'3"</p>
                    <p>Weight: 230 lbs</p>
                    <p>Born: January 15, 1990 in Houston, TX</p>
                    <p>College: Texas Tech</p>
                    <p>Draft: 2017 Kansas City Chiefs, Round 1, Pick 10</p>
                </div>
                
                <table class="stats_table" id="passing">
                    <thead>
                        <tr><th>Year</th><th>Team</th><th>Games</th><th>Passing Yards</th><th>Touchdowns</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>2023</td><td>${team}</td><td>16</td><td>4183</td><td>27</td></tr>
                        <tr><td>2022</td><td>${team}</td><td>17</td><td>5250</td><td>41</td></tr>
                        <tr><td>Career</td><td></td><td>100</td><td>28424</td><td>219</td></tr>
                    </tbody>
                </table>
                
                <div class="question">
                    <p>What awards has ${name} won? ${name} has won 2 NFL MVP awards and 1 Super Bowl MVP award.</p>
                </div>
                
                <p>Additional content about ${name}'s career and achievements. This player has been one of the most dominant forces in the NFL, leading his team to multiple playoff appearances and championship games.</p>
            </div>
        </body>
        </html>
        `;
  }

  /**
   * Generate mock scrape results for export testing
   */
  generateMockScrapeResults() {
    return [
      {
        index: 0,
        url: 'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
        success: true,
        text: 'Patrick Mahomes QB content...',
        metadata: { title: 'Patrick Mahomes Stats' },
        extractionDebug: {
          structuredData: {
            player: {
              name: 'Patrick Mahomes',
              position: 'QB',
              height: '6\'3"',
              weight: '230 lbs',
              college: 'Texas Tech',
            },
            statistics: {
              career: { passingYards: 28424, touchdowns: 219 },
              seasons: [
                { year: 2023, passingYards: 4183, touchdowns: 27 },
                { year: 2022, passingYards: 5250, touchdowns: 41 },
              ],
            },
            achievements: ['2x NFL MVP', 'Super Bowl MVP'],
          },
          sportsValidation: { isValid: true, score: 6 },
        },
      },
      {
        index: 1,
        url: 'https://www.pro-football-reference.com/players/H/HenrDe00.htm',
        success: true,
        text: 'Derrick Henry RB content...',
        metadata: { title: 'Derrick Henry Stats' },
        extractionDebug: {
          structuredData: {
            player: {
              name: 'Derrick Henry',
              position: 'RB',
              height: '6\'3"',
              weight: '247 lbs',
              college: 'Alabama',
            },
            statistics: {
              career: { rushingYards: 9502, touchdowns: 90 },
              seasons: [
                { year: 2023, rushingYards: 1167, touchdowns: 12 },
                { year: 2020, rushingYards: 2027, touchdowns: 17 },
              ],
            },
            achievements: ['NFL Rushing Champion', 'NFL Offensive Player of the Year'],
          },
          sportsValidation: { isValid: true, score: 5 },
        },
      },
    ];
  }

  /**
   * Assess extraction accuracy against expected data
   */
  assessExtractionAccuracy(extractionResult, expected) {
    let score = 0;
    const issues = [];
    const maxScore = 100;

    // Check player name extraction
    if (extractionResult.structuredData.player.name === expected.name) {
      score += 30;
    } else {
      issues.push(
        `Name mismatch: expected "${expected.name}", got "${extractionResult.structuredData.player.name}"`
      );
    }

    // Check position extraction
    if (extractionResult.structuredData.player.position === expected.position) {
      score += 20;
    } else {
      issues.push(
        `Position mismatch: expected "${expected.position}", got "${extractionResult.structuredData.player.position}"`
      );
    }

    // Check content length
    if (extractionResult.content.length >= EXPECTED_DATA_PATTERNS.content.minLength) {
      score += 20;
    } else {
      issues.push(`Content too short: ${extractionResult.content.length} chars`);
    }

    // Check sports keywords
    if (EXPECTED_DATA_PATTERNS.content.hasSportsKeywords.test(extractionResult.content)) {
      score += 15;
    } else {
      issues.push('Missing sports keywords');
    }

    // Check numerical data
    if (EXPECTED_DATA_PATTERNS.content.hasNumbers.test(extractionResult.content)) {
      score += 15;
    } else {
      issues.push('Missing numerical data');
    }

    return { score: Math.min(score, maxScore), issues };
  }

  /**
   * Assess structured data quality
   */
  assessStructuredDataQuality(structuredData, expected) {
    let score = 0;
    const player = structuredData.player || {};
    const stats = structuredData.statistics || {};

    // Player completeness (40 points)
    if (player.name) score += 10;
    if (player.position) score += 10;
    if (player.height && player.weight) score += 10;
    if (player.college) score += 10;

    // Statistics availability (40 points)
    if (Object.keys(stats.career || {}).length > 0) score += 20;
    if ((stats.seasons || []).length > 0) score += 20;

    // Additional data (20 points)
    if ((structuredData.achievements || []).length > 0) score += 10;
    if (player.draft) score += 10;

    return score;
  }

  /**
   * Calculate player data completeness percentage
   */
  calculatePlayerDataCompleteness(playerData) {
    const fields = [
      'name',
      'position',
      'height',
      'weight',
      'birthDate',
      'birthPlace',
      'college',
      'draft',
    ];
    const completedFields = fields.filter(field => {
      if (field === 'draft') {
        return playerData[field] && Object.keys(playerData[field]).length > 0;
      }
      return playerData[field] && playerData[field].toString().trim().length > 0;
    });

    return Math.round((completedFields.length / fields.length) * 100);
  }

  /**
   * Validate export format
   */
  validateExportFormat(exportedData, format) {
    const issues = [];
    let isValid = true;

    try {
      switch (format) {
        case 'enhanced-csv':
          if (!exportedData.includes('player_name,position')) {
            issues.push('Missing expected CSV headers');
            isValid = false;
          }
          if (exportedData.split('\n').length < 2) {
            issues.push('CSV appears to have no data rows');
            isValid = false;
          }
          break;

        case 'structured-json':
          const jsonData = JSON.parse(exportedData);
          if (!jsonData.exportInfo || !jsonData.players) {
            issues.push('Missing required JSON structure');
            isValid = false;
          }
          break;

        case 'player-database':
          const dbData = JSON.parse(exportedData);
          if (!dbData.players || !dbData.statistics || !dbData.metadata) {
            issues.push('Missing required database tables');
            isValid = false;
          }
          break;
      }
    } catch (error) {
      issues.push(`Format validation error: ${error.message}`);
      isValid = false;
    }

    return { isValid, issues };
  }

  /**
   * Generate recommendations based on test results
   */
  generateRecommendations(results) {
    const recommendations = [];

    // Check overall pass rate
    const passRate = (results.passed / results.totalTests) * 100;
    if (passRate < 80) {
      recommendations.push({
        priority: 'high',
        category: 'accuracy',
        message: `Overall pass rate is ${passRate.toFixed(1)}%. Consider improving content extraction algorithms.`,
      });
    }

    // Check extraction accuracy
    const extractionAccuracy = results.details.extractionAccuracy;
    if (extractionAccuracy.passed / extractionAccuracy.totalTests < 0.8) {
      recommendations.push({
        priority: 'high',
        category: 'extraction',
        message:
          'Content extraction accuracy is below 80%. Review selector patterns and scoring algorithms.',
      });
    }

    // Check structured data quality
    const structuredDataQuality = results.details.structuredDataQuality;
    if (structuredDataQuality.passed / structuredDataQuality.totalTests < 0.7) {
      recommendations.push({
        priority: 'medium',
        category: 'structured_data',
        message:
          'Structured data quality is below 70%. Improve biographical data extraction patterns.',
      });
    }

    // Check performance
    if (results.details.performance.averageExtractionTime > 100) {
      recommendations.push({
        priority: 'medium',
        category: 'performance',
        message: `Average extraction time is ${results.details.performance.averageExtractionTime.toFixed(1)}ms. Consider optimization.`,
      });
    }

    return recommendations;
  }

  /**
   * Print formatted test results
   */
  printTestResults(results) {
    console.info('\n' + '='.repeat(60));
    console.info('🏈 SPORTS SCRAPER TEST RESULTS');
    console.info('='.repeat(60));

    console.info(`\n📊 OVERALL SUMMARY:`);
    console.info(`Total Tests: ${results.totalTests}`);
    console.info(
      `Passed: ${results.passed} (${((results.passed / results.totalTests) * 100).toFixed(1)}%)`
    );
    console.info(
      `Failed: ${results.failed} (${((results.failed / results.totalTests) * 100).toFixed(1)}%)`
    );
    console.info(`Total Time: ${results.performance.totalTime}ms`);

    console.info(`\n🎯 TEST CATEGORY BREAKDOWN:`);
    Object.entries(results.details).forEach(([category, categoryResults]) => {
      if (categoryResults.totalTests) {
        const passRate = ((categoryResults.passed / categoryResults.totalTests) * 100).toFixed(1);
        console.info(
          `${category}: ${categoryResults.passed}/${categoryResults.totalTests} (${passRate}%)`
        );
      }
    });

    if (results.recommendations.length > 0) {
      console.info(`\n💡 RECOMMENDATIONS:`);
      results.recommendations.forEach((rec, index) => {
        const priority = rec.priority === 'high' ? '🔴' : '🟡';
        console.info(`${priority} ${rec.category.toUpperCase()}: ${rec.message}`);
      });
    }

    console.info('\n' + '='.repeat(60));

    const overallGrade = this.calculateOverallGrade(results);
    console.info(`🏆 OVERALL GRADE: ${overallGrade}`);
    console.info('='.repeat(60) + '\n');
  }

  /**
   * Calculate overall grade based on test results
   */
  calculateOverallGrade(results) {
    const passRate = (results.passed / results.totalTests) * 100;

    if (passRate >= 95) return 'A+ (Excellent)';
    if (passRate >= 90) return 'A (Very Good)';
    if (passRate >= 85) return 'B+ (Good)';
    if (passRate >= 80) return 'B (Satisfactory)';
    if (passRate >= 70) return 'C (Needs Improvement)';
    if (passRate >= 60) return 'D (Poor)';
    return 'F (Failing)';
  }
}

// Export for use in tests
module.exports = { SportsScraperTestSuite, TEST_PLAYER_URLS, EXPECTED_DATA_PATTERNS };

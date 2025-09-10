/**
 * Enhanced Export Functionality for Sports Statistics Data
 * Supports multiple output formats with structured data preservation
 */

/**
 * Enhanced sports data export manager
 */
class SportsDataExporter {
  constructor() {
    this.debug = true;
  }

  /**
   * Export scraped sports data in multiple formats
   */
  exportSportsData(scrapeResults, format = 'enhanced-csv') {
    const processedResults = this.processScrapeResults(scrapeResults);
    
    switch (format.toLowerCase()) {
      case 'enhanced-csv':
        return this.exportEnhancedCSV(processedResults);
      case 'structured-json':
        return this.exportStructuredJSON(processedResults);
      case 'player-database':
        return this.exportPlayerDatabase(processedResults);
      case 'excel-compatible':
        return this.exportExcelCompatible(processedResults);
      case 'statistics-csv':
        return this.exportStatisticsCSV(processedResults);
      case 'original-csv':
        return this.exportOriginalCSV(processedResults);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Process scrape results to extract structured sports data
   */
  processScrapeResults(scrapeResults) {
    return scrapeResults
      .filter(Boolean)
      .sort((a, b) => a.index - b.index)
      .map(result => {
        const processed = {
          ...result,
          sportsData: result.extractionDebug?.structuredData || {},
          sportsValidation: result.extractionDebug?.sportsValidation || {}
        };
        
        // Extract additional structured data if available
        if (result.extractionDebug?.structuredData) {
          processed.hasStructuredData = true;
          processed.structuredDataQuality = this.assessStructuredDataQuality(result.extractionDebug.structuredData);
        }
        
        return processed;
      });
  }

  /**
   * Export enhanced CSV with sports-specific columns
   */
  exportEnhancedCSV(processedResults) {
    const headers = [
      'url', 'success', 'error',
      // Player Information
      'player_name', 'position', 'jersey_number', 'height', 'weight',
      'birth_date', 'birth_place', 'college',
      // Draft Information
      'draft_year', 'draft_team', 'draft_round', 'draft_pick',
      // Data Quality Metrics
      'content_length', 'extraction_method', 'sports_validation_score',
      'has_structured_data', 'structured_data_quality',
      // Achievements
      'achievements_count', 'top_achievements',
      // Statistics Summary
      'career_stats_available', 'season_stats_count', 'playoff_stats_available',
      // Original Data
      'title', 'author', 'published_at', 'description', 'text'
    ];
    
    const rows = processedResults.map(result => {
      const player = result.sportsData?.player || {};
      const stats = result.sportsData?.statistics || {};
      const achievements = result.sportsData?.achievements || [];
      
      return [
        result.url,
        result.success,
        result.error || '',
        // Player Information
        player.name || '',
        player.position || '',
        player.jerseyNumber || '',
        player.height || '',
        player.weight || '',
        player.birthDate || '',
        player.birthPlace || '',
        player.college || '',
        // Draft Information
        player.draft?.year || '',
        player.draft?.team || '',
        player.draft?.round || '',
        player.draft?.pick || '',
        // Data Quality Metrics
        result.text?.length || 0,
        result.extractionDebug?.selectedMethod || '',
        result.sportsValidation?.score || 0,
        result.hasStructuredData || false,
        result.structuredDataQuality || 0,
        // Achievements
        achievements.length,
        achievements.slice(0, 3).join('; '),
        // Statistics Summary
        Object.keys(stats.career || {}).length > 0,
        stats.seasons?.length || 0,
        Object.keys(stats.playoffs || {}).length > 0,
        // Original Data
        result.metadata?.title || '',
        result.metadata?.author || '',
        result.metadata?.published_at || '',
        result.metadata?.description || '',
        result.text || ''
      ];
    });
    
    return this.arrayToCSV([headers, ...rows]);
  }

  /**
   * Export structured JSON with normalized player objects
   */
  exportStructuredJSON(processedResults) {
    const structuredData = {
      exportInfo: {
        timestamp: new Date().toISOString(),
        totalPlayers: processedResults.length,
        successfulExtractions: processedResults.filter(r => r.success).length,
        format: 'structured-json'
      },
      players: processedResults.map(result => this.createPlayerObject(result))
    };
    
    return JSON.stringify(structuredData, null, 2);
  }

  /**
   * Export player database format (normalized relational structure)
   */
  exportPlayerDatabase(processedResults) {
    const database = {
      players: [],
      statistics: [],
      achievements: [],
      draft_info: [],
      metadata: {
        exported_at: new Date().toISOString(),
        total_records: processedResults.length,
        schema_version: '1.0'
      }
    };
    
    processedResults.forEach((result, index) => {
      const playerId = `player_${index + 1}`;
      const player = result.sportsData?.player || {};
      const stats = result.sportsData?.statistics || {};
      const achievements = result.sportsData?.achievements || [];
      
      // Players table
      database.players.push({
        id: playerId,
        name: player.name || null,
        position: player.position || null,
        jersey_number: player.jerseyNumber || null,
        height: player.height || null,
        weight: player.weight || null,
        birth_date: player.birthDate || null,
        birth_place: player.birthPlace || null,
        college: player.college || null,
        source_url: result.url,
        extraction_success: result.success,
        extraction_date: new Date().toISOString()
      });
      
      // Draft information
      if (player.draft) {
        database.draft_info.push({
          player_id: playerId,
          draft_year: player.draft.year,
          draft_team: player.draft.team,
          draft_round: player.draft.round,
          draft_pick: player.draft.pick
        });
      }
      
      // Statistics
      if (stats.career && Object.keys(stats.career).length > 0) {
        database.statistics.push({
          player_id: playerId,
          stat_type: 'career',
          data: stats.career
        });
      }
      
      if (stats.seasons && stats.seasons.length > 0) {
        stats.seasons.forEach((season, seasonIndex) => {
          database.statistics.push({
            player_id: playerId,
            stat_type: 'season',
            season_index: seasonIndex,
            data: season
          });
        });
      }
      
      if (stats.playoffs && Object.keys(stats.playoffs).length > 0) {
        database.statistics.push({
          player_id: playerId,
          stat_type: 'playoffs',
          data: stats.playoffs
        });
      }
      
      // Achievements
      achievements.forEach((achievement, achIndex) => {
        database.achievements.push({
          player_id: playerId,
          achievement_index: achIndex,
          achievement: achievement
        });
      });
    });
    
    return JSON.stringify(database, null, 2);
  }

  /**
   * Export Excel-compatible format with multiple sheets structure
   */
  exportExcelCompatible(processedResults) {
    const workbook = {
      metadata: {
        format: 'excel-compatible',
        sheets: ['Players', 'Statistics', 'Achievements', 'Raw_Data'],
        created_at: new Date().toISOString()
      },
      sheets: {}
    };
    
    // Players sheet
    const playersHeaders = [
      'ID', 'Name', 'Position', 'Jersey', 'Height', 'Weight', 
      'Birth Date', 'Birth Place', 'College', 'Draft Year', 
      'Draft Team', 'Draft Round', 'Draft Pick', 'Source URL'
    ];
    
    const playersData = processedResults.map((result, index) => {
      const player = result.sportsData?.player || {};
      return [
        `P${index + 1}`,
        player.name || '',
        player.position || '',
        player.jerseyNumber || '',
        player.height || '',
        player.weight || '',
        player.birthDate || '',
        player.birthPlace || '',
        player.college || '',
        player.draft?.year || '',
        player.draft?.team || '',
        player.draft?.round || '',
        player.draft?.pick || '',
        result.url
      ];
    });
    
    workbook.sheets.Players = {
      headers: playersHeaders,
      data: playersData
    };
    
    // Statistics sheet
    const statisticsHeaders = [
      'Player_ID', 'Player_Name', 'Stat_Type', 'Season', 'Data'
    ];
    
    const statisticsData = [];
    processedResults.forEach((result, index) => {
      const playerId = `P${index + 1}`;
      const playerName = result.sportsData?.player?.name || '';
      const stats = result.sportsData?.statistics || {};
      
      if (stats.career && Object.keys(stats.career).length > 0) {
        statisticsData.push([
          playerId, playerName, 'Career', 'All', JSON.stringify(stats.career)
        ]);
      }
      
      if (stats.seasons) {
        stats.seasons.forEach((season, seasonIndex) => {
          statisticsData.push([
            playerId, playerName, 'Season', seasonIndex + 1, JSON.stringify(season)
          ]);
        });
      }
      
      if (stats.playoffs && Object.keys(stats.playoffs).length > 0) {
        statisticsData.push([
          playerId, playerName, 'Playoffs', 'All', JSON.stringify(stats.playoffs)
        ]);
      }
    });
    
    workbook.sheets.Statistics = {
      headers: statisticsHeaders,
      data: statisticsData
    };
    
    // Achievements sheet
    const achievementsHeaders = ['Player_ID', 'Player_Name', 'Achievement'];
    const achievementsData = [];
    
    processedResults.forEach((result, index) => {
      const playerId = `P${index + 1}`;
      const playerName = result.sportsData?.player?.name || '';
      const achievements = result.sportsData?.achievements || [];
      
      achievements.forEach(achievement => {
        achievementsData.push([playerId, playerName, achievement]);
      });
    });
    
    workbook.sheets.Achievements = {
      headers: achievementsHeaders,
      data: achievementsData
    };
    
    // Raw Data sheet
    const rawHeaders = [
      'URL', 'Success', 'Error', 'Title', 'Content_Length', 
      'Extraction_Method', 'Sports_Validation_Score', 'Raw_Text'
    ];
    
    const rawData = processedResults.map(result => [
      result.url,
      result.success,
      result.error || '',
      result.metadata?.title || '',
      result.text?.length || 0,
      result.extractionDebug?.selectedMethod || '',
      result.sportsValidation?.score || 0,
      (result.text || '').substring(0, 1000) // Truncate for Excel compatibility
    ]);
    
    workbook.sheets.Raw_Data = {
      headers: rawHeaders,
      data: rawData
    };
    
    return JSON.stringify(workbook, null, 2);
  }

  /**
   * Export statistics-focused CSV
   */
  exportStatisticsCSV(processedResults) {
    const allStats = [];
    
    processedResults.forEach(result => {
      const player = result.sportsData?.player || {};
      const stats = result.sportsData?.statistics || {};
      
      // Career stats
      if (stats.career && Object.keys(stats.career).length > 0) {
        allStats.push({
          player_name: player.name || '',
          position: player.position || '',
          stat_type: 'Career',
          season: 'All',
          source_url: result.url,
          ...stats.career
        });
      }
      
      // Season stats
      if (stats.seasons) {
        stats.seasons.forEach((season, index) => {
          allStats.push({
            player_name: player.name || '',
            position: player.position || '',
            stat_type: 'Season',
            season: season.Year || season.Season || (index + 1),
            source_url: result.url,
            ...season
          });
        });
      }
      
      // Playoff stats
      if (stats.playoffs && Object.keys(stats.playoffs).length > 0) {
        allStats.push({
          player_name: player.name || '',
          position: player.position || '',
          stat_type: 'Playoffs',
          season: 'All',
          source_url: result.url,
          ...stats.playoffs
        });
      }
    });
    
    if (allStats.length === 0) {
      return this.exportOriginalCSV(processedResults);
    }
    
    // Get all unique column names
    const allColumns = new Set(['player_name', 'position', 'stat_type', 'season', 'source_url']);
    allStats.forEach(stat => {
      Object.keys(stat).forEach(key => allColumns.add(key));
    });
    
    const headers = Array.from(allColumns);
    const rows = allStats.map(stat => 
      headers.map(header => stat[header] || '')
    );
    
    return this.arrayToCSV([headers, ...rows]);
  }

  /**
   * Export original CSV format (backward compatibility)
   */
  exportOriginalCSV(processedResults) {
    const headers = ['url', 'title', 'author', 'published_at', 'description', 'text', 'success', 'error'];
    const rows = processedResults.map(result => [
      result.url,
      result.metadata?.title || '',
      result.metadata?.author || '',
      result.metadata?.published_at || '',
      result.metadata?.description || '',
      result.text || '',
      result.success,
      result.error || ''
    ]);
    
    return this.arrayToCSV([headers, ...rows]);
  }

  /**
   * Create normalized player object
   */
  createPlayerObject(result) {
    const player = result.sportsData?.player || {};
    const stats = result.sportsData?.statistics || {};
    const achievements = result.sportsData?.achievements || [];
    
    return {
      id: `player_${result.index}`,
      url: result.url,
      extractionInfo: {
        success: result.success,
        error: result.error || null,
        method: result.extractionDebug?.selectedMethod,
        contentLength: result.text?.length || 0,
        sportsValidationScore: result.sportsValidation?.score || 0,
        extractedAt: new Date().toISOString()
      },
      profile: {
        name: player.name || null,
        position: player.position || null,
        jerseyNumber: player.jerseyNumber || null,
        physicalStats: {
          height: player.height || null,
          weight: player.weight || null
        },
        personal: {
          birthDate: player.birthDate || null,
          birthPlace: player.birthPlace || null,
          college: player.college || null
        },
        draft: player.draft || null
      },
      statistics: {
        career: stats.career || {},
        seasons: stats.seasons || [],
        playoffs: stats.playoffs || {}
      },
      achievements: achievements,
      faqData: player.faqData || {},
      metadata: result.metadata || {},
      rawText: result.text || ''
    };
  }

  /**
   * Assess quality of structured data extraction
   */
  assessStructuredDataQuality(structuredData) {
    if (!structuredData) return 0;
    
    let score = 0;
    const player = structuredData.player || {};
    const stats = structuredData.statistics || {};
    const achievements = structuredData.achievements || [];
    
    // Player information completeness
    if (player.name) score += 20;
    if (player.position) score += 15;
    if (player.height && player.weight) score += 10;
    if (player.birthDate) score += 10;
    if (player.college) score += 10;
    if (player.draft) score += 15;
    
    // Statistics availability
    if (stats.career && Object.keys(stats.career).length > 0) score += 10;
    if (stats.seasons && stats.seasons.length > 0) score += 10;
    if (stats.playoffs && Object.keys(stats.playoffs).length > 0) score += 5;
    
    // Achievements
    if (achievements.length > 0) score += 5;
    
    return Math.min(score, 100); // Cap at 100
  }

  /**
   * Convert array data to CSV format
   */
  arrayToCSV(data) {
    const escapeCSV = (value) => {
      const str = (value || '').toString();
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    return data.map(row => 
      row.map(cell => escapeCSV(cell)).join(',')
    ).join('\n');
  }

  /**
   * Get available export formats
   */
  getAvailableFormats() {
    return [
      {
        id: 'enhanced-csv',
        name: 'Enhanced CSV',
        description: 'CSV with sports-specific columns and structured data'
      },
      {
        id: 'structured-json',
        name: 'Structured JSON',
        description: 'JSON with normalized player objects and metadata'
      },
      {
        id: 'player-database',
        name: 'Player Database',
        description: 'Normalized relational database structure'
      },
      {
        id: 'excel-compatible',
        name: 'Excel Compatible',
        description: 'Multi-sheet structure for Excel import'
      },
      {
        id: 'statistics-csv',
        name: 'Statistics CSV',
        description: 'Focused on statistical data with one row per stat entry'
      },
      {
        id: 'original-csv',
        name: 'Original CSV',
        description: 'Original format for backward compatibility'
      }
    ];
  }
}

module.exports = { SportsDataExporter };
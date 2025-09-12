/**
 * Sports Content Extractor
 * 
 * Uses existing sports engine as core with enhanced content extraction
 */

import { Document } from 'jsdom';
import { BaseExtractor, ExtractionResult } from './base';
import { SportsContentExtractor as CoreSportsExtractor } from '../sports-extractor';

export interface SportsExtractionData {
  title: string;
  content: string;
  sport: string;
  team?: string;
  player?: string;
  event?: string;
  date?: string;
  score?: string;
  url: string;
  metadata: Record<string, string>;
  images?: string[];
  stats?: Record<string, any>;
}

export class SportsExtractor extends BaseExtractor {
  private coreExtractor: CoreSportsExtractor;

  constructor(options: any = {}) {
    super(options);
    this.coreExtractor = new CoreSportsExtractor();
  }

  async extract(document: Document, url: string): Promise<ExtractionResult> {
    try {
      this.logger.debug({ url }, 'Starting sports content extraction');

      // Use core sports extractor first
      const coreResult = await this.coreExtractor.extract(document, url);
      
      const data: SportsExtractionData = {
        title: coreResult.title || '',
        content: coreResult.content || '',
        sport: coreResult.sport || '',
        team: coreResult.team,
        player: coreResult.player,
        event: coreResult.event,
        date: coreResult.date,
        score: coreResult.score,
        url,
        metadata: this.extractMetadata(document),
        images: this.extractImages(document),
        stats: coreResult.stats,
      };

      // If core extractor didn't get enough content, use fallbacks
      if (!data.content || data.content.length < this.options.minContentLength) {
        this.logger.warn({ url, coreContentLength: data.content.length }, 'Core sports extractor insufficient, using fallbacks');
        
        const fallbackContent = this.extractTextWithFallbacks(document, url);
        if (fallbackContent) {
          data.content = fallbackContent;
        }
      }

      // Extract additional sports-specific metadata
      if (!data.sport) {
        data.sport = this.extractSport(document);
      }

      if (!data.team) {
        data.team = this.extractTeam(document);
      }

      if (!data.player) {
        data.player = this.extractPlayer(document);
      }

      if (!data.event) {
        data.event = this.extractEvent(document);
      }

      if (!data.date) {
        data.date = this.extractDate(document);
      }

      if (!data.score) {
        data.score = this.extractScore(document);
      }

      this.logger.info({ 
        url, 
        title: data.title,
        sport: data.sport,
        team: data.team,
        contentLength: data.content.length,
        images: data.images?.length || 0
      }, 'Sports content extracted successfully');

      return this.validateResult({
        success: true,
        data,
      }, url);

    } catch (error) {
      this.logger.error({ 
        url, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Sports extraction failed');

      return this.validateResult({
        success: false,
        data: { 
          title: '', 
          content: '', 
          sport: '',
          url, 
          metadata: {} 
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      }, url);
    }
  }

  protected extractPrimaryContent(document: Document): string {
    // Try sports-specific content selectors
    const sportsSelectors = [
      '.sports-content',
      '.game-content',
      '.match-content',
      '.article-content',
      '.post-content',
      'article',
      '.content',
      'main',
    ];

    for (const selector of sportsSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent?.trim() || '';
        if (text.length >= this.options.minContentLength) {
          this.logger.debug({ selector, length: text.length }, 'Found content with sports selector');
          return text;
        }
      }
    }

    // Try to extract from paragraphs, focusing on content areas
    const contentAreas = document.querySelectorAll('.content p, article p, main p');
    if (contentAreas.length > 0) {
      const content = Array.from(contentAreas)
        .map(p => p.textContent?.trim())
        .filter(text => text && text.length > 30)
        .join('\n\n');

      if (content.length >= this.options.minContentLength) {
        this.logger.debug({ paragraphs: contentAreas.length, length: content.length }, 'Found content with paragraph extraction');
        return content;
      }
    }

    return '';
  }

  private extractSport(document: Document): string {
    const sportKeywords = [
      'football', 'soccer', 'basketball', 'baseball', 'tennis', 'golf',
      'hockey', 'cricket', 'rugby', 'volleyball', 'swimming', 'track',
      'cycling', 'boxing', 'mma', 'wrestling', 'skiing', 'snowboarding'
    ];

    const text = document.body?.textContent?.toLowerCase() || '';
    
    for (const sport of sportKeywords) {
      if (text.includes(sport)) {
        this.logger.debug({ sport }, 'Detected sport from content');
        return sport;
      }
    }

    return '';
  }

  private extractTeam(document: Document): string {
    const teamSelectors = [
      '.team-name',
      '.team',
      '.home-team',
      '.away-team',
      '.team-info',
      '.squad',
    ];

    for (const selector of teamSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const team = element.textContent?.trim();
        if (team && team.length > 0) {
          this.logger.debug({ selector, team }, 'Found team');
          return team;
        }
      }
    }

    return '';
  }

  private extractPlayer(document: Document): string {
    const playerSelectors = [
      '.player-name',
      '.player',
      '.athlete',
      '.star-player',
      '.mvp',
    ];

    for (const selector of playerSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const player = element.textContent?.trim();
        if (player && player.length > 0) {
          this.logger.debug({ selector, player }, 'Found player');
          return player;
        }
      }
    }

    return '';
  }

  private extractEvent(document: Document): string {
    const eventSelectors = [
      '.event-name',
      '.event',
      '.match-name',
      '.game-name',
      '.tournament',
      '.competition',
    ];

    for (const selector of eventSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const event = element.textContent?.trim();
        if (event && event.length > 0) {
          this.logger.debug({ selector, event }, 'Found event');
          return event;
        }
      }
    }

    return '';
  }

  private extractDate(document: Document): string {
    const dateSelectors = [
      'time[datetime]',
      '.date',
      '.game-date',
      '.match-date',
      '.event-date',
      '.published',
    ];

    for (const selector of dateSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const date = element.getAttribute('datetime') || element.textContent?.trim();
        if (date && date.length > 0) {
          this.logger.debug({ selector, date }, 'Found date');
          return date;
        }
      }
    }

    return '';
  }

  private extractScore(document: Document): string {
    const scoreSelectors = [
      '.score',
      '.final-score',
      '.game-score',
      '.match-score',
      '.result',
    ];

    for (const selector of scoreSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const score = element.textContent?.trim();
        if (score && score.length > 0) {
          this.logger.debug({ selector, score }, 'Found score');
          return score;
        }
      }
    }

    // Try to find score patterns in text
    const text = document.body?.textContent || '';
    const scorePatterns = [
      /\d+\s*-\s*\d+/g,  // 3-1, 21-19
      /\d+\s*:\s*\d+/g,  // 3:1, 21:19
      /\d+\s*to\s*\d+/gi, // 3 to 1
    ];

    for (const pattern of scorePatterns) {
      const match = text.match(pattern);
      if (match) {
        this.logger.debug({ score: match[0] }, 'Found score pattern');
        return match[0];
      }
    }

    return '';
  }

  private extractImages(document: Document): string[] {
    const images: string[] = [];
    
    const imageSelectors = [
      'img[src]',
      '.sports-image img[src]',
      '.game-image img[src]',
      '.player-image img[src]',
      'picture img[src]',
    ];

    for (const selector of imageSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const img of elements) {
        const src = img.getAttribute('src');
        if (src) {
          try {
            const absoluteUrl = new URL(src, document.URL).toString();
            images.push(absoluteUrl);
          } catch (error) {
            continue;
          }
        }
      }
    }

    return [...new Set(images)];
  }
}
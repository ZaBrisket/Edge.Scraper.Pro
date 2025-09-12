/**
 * Companies Extractor
 * 
 * Extracts structured company profiles from homepage content
 * including title, meta, hero copy, nav, locations, and de-dupes boilerplate
 */

import { Document } from 'jsdom';
import { BaseExtractor, ExtractionResult } from './base';

export interface CompanyExtractionData {
  title: string;
  content: string;
  description: string;
  heroCopy: string;
  navigation: string[];
  locations: string[];
  contactInfo: {
    email?: string;
    phone?: string;
    address?: string;
  };
  socialMedia: {
    website?: string;
    linkedin?: string;
    twitter?: string;
    facebook?: string;
  };
  industry?: string;
  size?: string;
  founded?: string;
  url: string;
  metadata: Record<string, string>;
  images?: string[];
  services?: string[];
  technologies?: string[];
}

export class CompaniesExtractor extends BaseExtractor {
  private readonly heroSelectors = [
    '.hero',
    '.hero-section',
    '.banner',
    '.jumbotron',
    '.main-banner',
    '.intro',
    '.intro-section',
    '.welcome',
    '.overview',
  ];

  private readonly navSelectors = [
    'nav a',
    '.navigation a',
    '.menu a',
    '.navbar a',
    '.nav a',
    'header a',
  ];

  private readonly contactSelectors = [
    '.contact',
    '.contact-info',
    '.contact-details',
    '.get-in-touch',
    '.reach-us',
    '.contact-us',
  ];

  private readonly serviceSelectors = [
    '.services a',
    '.services li',
    '.what-we-do a',
    '.what-we-do li',
    '.offerings a',
    '.offerings li',
    '.solutions a',
    '.solutions li',
  ];

  private readonly techSelectors = [
    '.technologies',
    '.tech-stack',
    '.tools',
    '.platforms',
    '.technologies li',
    '.tech-stack li',
    '.tools li',
    '.platforms li',
  ];

  private readonly industryKeywords = [
    'technology', 'software', 'healthcare', 'finance', 'education',
    'retail', 'manufacturing', 'consulting', 'marketing', 'advertising',
    'real estate', 'construction', 'automotive', 'aerospace', 'energy',
    'telecommunications', 'media', 'entertainment', 'gaming', 'e-commerce'
  ];

  async extract(document: Document, url: string): Promise<ExtractionResult> {
    try {
      this.logger.debug({ url }, 'Starting company profile extraction');

      const data: CompanyExtractionData = {
        title: '',
        content: '',
        description: '',
        heroCopy: '',
        navigation: [],
        locations: [],
        contactInfo: {},
        socialMedia: {},
        url,
        metadata: this.extractMetadata(document),
        images: [],
        services: [],
        technologies: [],
      };

      // Extract title
      data.title = this.extractTitle(document);
      if (!data.title) {
        data.title = data.metadata.title || data.metadata.ogTitle || 'Untitled Company';
      }

      // Extract description
      data.description = this.extractDescription(document);
      if (!data.description) {
        data.description = data.metadata.description || data.metadata.ogDescription || '';
      }

      // Extract hero copy
      data.heroCopy = this.extractHeroCopy(document);

      // Extract navigation
      data.navigation = this.extractNavigation(document);

      // Extract locations
      data.locations = this.extractLocations(document);

      // Extract contact information
      data.contactInfo = this.extractContactInfo(document);

      // Extract social media links
      data.socialMedia = this.extractSocialMedia(document);

      // Extract industry
      data.industry = this.extractIndustry(document);

      // Extract company size
      data.size = this.extractCompanySize(document);

      // Extract founded year
      data.founded = this.extractFoundedYear(document);

      // Extract services
      data.services = this.extractServices(document);

      // Extract technologies
      data.technologies = this.extractTechnologies(document);

      // Extract images
      data.images = this.extractImages(document);

      // Extract main content with fallbacks
      const content = this.extractTextWithFallbacks(document, url);
      if (!content) {
        return this.validateResult({
          success: false,
          data,
          error: 'No content extracted',
        }, url);
      }

      data.content = content;

      this.logger.info({ 
        url, 
        title: data.title,
        industry: data.industry,
        contentLength: data.content.length,
        services: data.services.length,
        technologies: data.technologies.length,
        locations: data.locations.length
      }, 'Company profile extracted successfully');

      return this.validateResult({
        success: true,
        data,
      }, url);

    } catch (error) {
      this.logger.error({ 
        url, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Company extraction failed');

      return this.validateResult({
        success: false,
        data: { 
          title: '', 
          content: '', 
          description: '',
          heroCopy: '',
          navigation: [],
          locations: [],
          contactInfo: {},
          socialMedia: {},
          url, 
          metadata: {} 
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      }, url);
    }
  }

  protected extractPrimaryContent(document: Document): string {
    // Try company-specific content selectors
    const companySelectors = [
      '.about',
      '.about-us',
      '.company',
      '.overview',
      '.intro',
      '.welcome',
      '.content',
      'main',
      'article',
    ];

    for (const selector of companySelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent?.trim() || '';
        if (text.length >= this.options.minContentLength) {
          this.logger.debug({ selector, length: text.length }, 'Found content with company selector');
          return text;
        }
      }
    }

    // Try paragraph-based extraction
    const paragraphs = document.querySelectorAll('p');
    if (paragraphs.length > 0) {
      const content = Array.from(paragraphs)
        .map(p => p.textContent?.trim())
        .filter(text => text && text.length > 50)
        .join('\n\n');

      if (content.length >= this.options.minContentLength) {
        this.logger.debug({ paragraphs: paragraphs.length, length: content.length }, 'Found content with paragraph extraction');
        return content;
      }
    }

    return '';
  }

  private extractTitle(document: Document): string {
    const titleSelectors = [
      'h1',
      '.title',
      '.company-name',
      '.brand',
      '.logo-text',
      'title',
    ];

    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const title = element.textContent?.trim();
        if (title && title.length > 0) {
          this.logger.debug({ selector, title }, 'Found company title');
          return title;
        }
      }
    }

    return '';
  }

  private extractDescription(document: Document): string {
    const descriptionSelectors = [
      '.description',
      '.tagline',
      '.subtitle',
      '.intro-text',
      '.overview-text',
      'meta[name="description"]',
    ];

    for (const selector of descriptionSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const description = element.getAttribute('content') || element.textContent?.trim();
        if (description && description.length > 0) {
          this.logger.debug({ selector, description }, 'Found company description');
          return description;
        }
      }
    }

    return '';
  }

  private extractHeroCopy(document: Document): string {
    for (const selector of this.heroSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent?.trim() || '';
        if (text.length > 0) {
          this.logger.debug({ selector, length: text.length }, 'Found hero copy');
          return text;
        }
      }
    }

    return '';
  }

  private extractNavigation(document: Document): string[] {
    const navItems: string[] = [];
    
    for (const selector of this.navSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent?.trim();
        if (text && text.length > 0 && text.length < 50) { // Reasonable nav item length
          navItems.push(text);
        }
      }
    }

    // Remove duplicates and limit
    return [...new Set(navItems)].slice(0, 20);
  }

  private extractLocations(document: Document): string[] {
    const locations: string[] = [];
    
    // Look for location-specific selectors
    const locationSelectors = [
      '.location',
      '.office',
      '.address',
      '.contact-location',
      '.where-we-are',
    ];

    for (const selector of locationSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent?.trim();
        if (text && text.length > 0) {
          locations.push(text);
        }
      }
    }

    // Look for address patterns in text
    const text = document.body?.textContent || '';
    const addressPatterns = [
      /\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl)/g,
      /[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}/g, // City, State ZIP
    ];

    for (const pattern of addressPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        locations.push(...matches);
      }
    }

    return [...new Set(locations)].slice(0, 10);
  }

  private extractContactInfo(document: Document): Record<string, string> {
    const contactInfo: Record<string, string> = {};

    // Extract email
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const text = document.body?.textContent || '';
    const emailMatches = text.match(emailPattern);
    if (emailMatches) {
      contactInfo.email = emailMatches[0];
    }

    // Extract phone
    const phonePattern = /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
    const phoneMatches = text.match(phonePattern);
    if (phoneMatches) {
      contactInfo.phone = phoneMatches[0];
    }

    // Extract address
    const addressSelectors = [
      '.address',
      '.contact-address',
      '.office-address',
    ];

    for (const selector of addressSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const address = element.textContent?.trim();
        if (address && address.length > 0) {
          contactInfo.address = address;
          break;
        }
      }
    }

    return contactInfo;
  }

  private extractSocialMedia(document: Document): Record<string, string> {
    const socialMedia: Record<string, string> = {};
    
    const socialSelectors = [
      'a[href*="linkedin.com"]',
      'a[href*="twitter.com"]',
      'a[href*="facebook.com"]',
      'a[href*="instagram.com"]',
      'a[href*="youtube.com"]',
    ];

    for (const selector of socialSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const href = element.getAttribute('href');
        if (href) {
          if (href.includes('linkedin.com')) socialMedia.linkedin = href;
          else if (href.includes('twitter.com')) socialMedia.twitter = href;
          else if (href.includes('facebook.com')) socialMedia.facebook = href;
        }
      }
    }

    return socialMedia;
  }

  private extractIndustry(document: Document): string {
    const text = document.body?.textContent?.toLowerCase() || '';
    
    for (const industry of this.industryKeywords) {
      if (text.includes(industry)) {
        this.logger.debug({ industry }, 'Detected industry from content');
        return industry;
      }
    }

    return '';
  }

  private extractCompanySize(document: Document): string {
    const text = document.body?.textContent || '';
    const sizePatterns = [
      /(\d+)\s*employees?/gi,
      /(\d+)\s*people/gi,
      /(\d+)\s*staff/gi,
      /team\s*of\s*(\d+)/gi,
    ];

    for (const pattern of sizePatterns) {
      const match = text.match(pattern);
      if (match) {
        this.logger.debug({ size: match[0] }, 'Found company size');
        return match[0];
      }
    }

    return '';
  }

  private extractFoundedYear(document: Document): string {
    const text = document.body?.textContent || '';
    const foundedPatterns = [
      /founded\s*in\s*(\d{4})/gi,
      /since\s*(\d{4})/gi,
      /established\s*in\s*(\d{4})/gi,
      /(\d{4})\s*-\s*founded/gi,
    ];

    for (const pattern of foundedPatterns) {
      const match = text.match(pattern);
      if (match) {
        this.logger.debug({ founded: match[0] }, 'Found founded year');
        return match[0];
      }
    }

    return '';
  }

  private extractServices(document: Document): string[] {
    const services: string[] = [];
    
    for (const selector of this.serviceSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent?.trim();
        if (text && text.length > 0 && text.length < 100) {
          services.push(text);
        }
      }
    }

    return [...new Set(services)].slice(0, 20);
  }

  private extractTechnologies(document: Document): string[] {
    const technologies: string[] = [];
    
    for (const selector of this.techSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent?.trim();
        if (text && text.length > 0) {
          technologies.push(text);
        }
      }
    }

    return [...new Set(technologies)].slice(0, 30);
  }

  private extractImages(document: Document): string[] {
    const images: string[] = [];
    
    const imageSelectors = [
      'img[src]',
      '.company-image img[src]',
      '.hero-image img[src]',
      '.logo img[src]',
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
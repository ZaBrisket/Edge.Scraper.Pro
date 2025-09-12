"use strict";
/**
 * Common Parsing Utilities
 * Shared parsing functions used across different tasks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentParser = void 0;
exports.createContentParser = createContentParser;
const jsdom_1 = require("jsdom");
class ContentParser {
    constructor(html) {
        this.dom = new jsdom_1.JSDOM(html);
        this.document = this.dom.window.document;
    }
    // Extract title from various selectors
    extractTitle() {
        const selectors = [
            'h1[class*="title"]',
            'h1[class*="headline"]',
            '.article-title',
            '.entry-title',
            'h1.title',
            'h1.headline',
            'article h1',
            '[property="og:title"]',
            'title',
        ];
        for (const selector of selectors) {
            const element = this.document.querySelector(selector);
            if (element) {
                const content = selector === '[property="og:title"]'
                    ? element.getAttribute('content')
                    : element.textContent;
                if (content?.trim()) {
                    return content.trim();
                }
            }
        }
        return undefined;
    }
    // Extract description/excerpt
    extractDescription() {
        const selectors = [
            '[property="og:description"]',
            '[name="description"]',
            '.article-excerpt',
            '.excerpt',
            '.summary',
            '.lead',
        ];
        for (const selector of selectors) {
            const element = this.document.querySelector(selector);
            if (element) {
                const content = element.getAttribute('content') || element.textContent;
                if (content?.trim()) {
                    return content.trim();
                }
            }
        }
        return undefined;
    }
    // Extract main content
    extractContent(maxLength = 5000) {
        const selectors = [
            'article',
            '.article-content',
            '.entry-content',
            '.post-content',
            '.content',
            'main',
        ];
        for (const selector of selectors) {
            const element = this.document.querySelector(selector);
            if (element) {
                // Remove script and style elements
                const scripts = element.querySelectorAll('script, style');
                scripts.forEach(script => script.remove());
                const content = element.textContent?.trim();
                if (content && content.length > 100) {
                    return content.length > maxLength
                        ? content.substring(0, maxLength) + '...'
                        : content;
                }
            }
        }
        return undefined;
    }
    // Extract author information
    extractAuthor() {
        const selectors = [
            '[rel="author"]',
            '.author',
            '.article-author',
            '[class*="author"]',
            '[property="article:author"]',
            '[name="author"]',
        ];
        for (const selector of selectors) {
            const element = this.document.querySelector(selector);
            if (element) {
                const content = element.getAttribute('content') || element.textContent;
                if (content?.trim()) {
                    return content.trim();
                }
            }
        }
        return undefined;
    }
    // Extract publication date
    extractPublishedAt(format = 'iso') {
        const selectors = [
            '[property="article:published_time"]',
            '[name="article:published_time"]',
            'time[datetime]',
            '.publish-date',
            '.article-date',
            '[class*="publish"]',
            '[class*="date"]',
        ];
        for (const selector of selectors) {
            const element = this.document.querySelector(selector);
            if (element) {
                const dateStr = element.getAttribute('content') ||
                    element.getAttribute('datetime') ||
                    element.textContent?.trim();
                if (dateStr) {
                    const date = new Date(dateStr);
                    if (!isNaN(date.getTime())) {
                        return this.formatDate(date, format);
                    }
                }
            }
        }
        return undefined;
    }
    // Extract modified date
    extractModifiedAt(format = 'iso') {
        const selectors = [
            '[property="article:modified_time"]',
            '[name="article:modified_time"]',
            '.modified-date',
            '.updated-date',
        ];
        for (const selector of selectors) {
            const element = this.document.querySelector(selector);
            if (element) {
                const dateStr = element.getAttribute('content') || element.textContent?.trim();
                if (dateStr) {
                    const date = new Date(dateStr);
                    if (!isNaN(date.getTime())) {
                        return this.formatDate(date, format);
                    }
                }
            }
        }
        return undefined;
    }
    // Extract tags
    extractTags() {
        const tags = [];
        // Meta keywords
        const keywords = this.document.querySelector('[name="keywords"]');
        if (keywords) {
            const content = keywords.getAttribute('content');
            if (content) {
                tags.push(...content.split(',').map(tag => tag.trim()));
            }
        }
        // Article tags
        const tagElements = this.document.querySelectorAll('.tags a, .tag, [class*="tag"]');
        tagElements.forEach(element => {
            const text = element.textContent?.trim();
            if (text && !tags.includes(text)) {
                tags.push(text);
            }
        });
        return tags.filter(tag => tag.length > 0).slice(0, 10); // Limit to 10 tags
    }
    // Extract images
    extractImages(baseUrl, maxImages = 5) {
        const images = [];
        const imageElements = this.document.querySelectorAll('img');
        imageElements.forEach(img => {
            const src = img.getAttribute('src');
            if (src && images.length < maxImages) {
                try {
                    const absoluteUrl = new URL(src, baseUrl).href;
                    images.push({
                        src: absoluteUrl,
                        alt: img.getAttribute('alt') || undefined,
                        caption: this.extractImageCaption(img),
                    });
                }
                catch {
                    // Skip invalid URLs
                }
            }
        });
        return images;
    }
    // Extract language
    extractLanguage() {
        return this.document.documentElement.getAttribute('lang') ||
            this.document.querySelector('[property="og:locale"]')?.getAttribute('content') ||
            undefined;
    }
    // Extract all content in one go
    extractAll(options = {}) {
        const { maxContentLength = 5000, extractImages = false, maxImages = 5, dateFormat = 'iso', } = options;
        const content = this.extractContent(maxContentLength);
        const images = extractImages ? this.extractImages(window.location.href, maxImages) : undefined;
        return {
            title: this.extractTitle(),
            description: this.extractDescription(),
            content,
            author: this.extractAuthor(),
            publishedAt: this.extractPublishedAt(dateFormat),
            modifiedAt: this.extractModifiedAt(dateFormat),
            tags: this.extractTags(),
            images,
            metadata: {
                language: this.extractLanguage(),
                wordCount: content ? this.calculateWordCount(content) : undefined,
                readingTime: content ? Math.ceil(this.calculateWordCount(content) / 200) : undefined,
            },
        };
    }
    extractImageCaption(img) {
        const parent = img.parentElement;
        if (parent) {
            const caption = parent.querySelector('figcaption, .caption');
            if (caption?.textContent?.trim()) {
                return caption.textContent.trim();
            }
        }
        return img.getAttribute('title') || undefined;
    }
    calculateWordCount(text) {
        return text.split(/\s+/).filter(word => word.length > 0).length;
    }
    formatDate(date, format) {
        switch (format) {
            case 'timestamp':
                return date.getTime().toString();
            case 'human':
                return date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            default:
                return date.toISOString();
        }
    }
}
exports.ContentParser = ContentParser;
// Utility function to create content parser
function createContentParser(html) {
    return new ContentParser(html);
}
//# sourceMappingURL=parsers.js.map
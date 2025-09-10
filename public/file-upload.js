/**
 * File Upload Handler for Edge.Scraper.Pro
 * 
 * Handles file uploads, parsing, and URL extraction with support for:
 * - TXT files (one URL per line)
 * - JSON files (multiple formats)
 * - Drag and drop functionality
 * - Progress tracking
 * - Validation integration
 */

class FileUploadHandler {
    constructor(options = {}) {
        this.options = {
            maxFileSize: options.maxFileSize || 5 * 1024 * 1024, // 5MB
            maxUrls: options.maxUrls || 1500,
            allowedFormats: options.allowedFormats || ['.txt', '.json'],
            onProgress: options.onProgress || (() => {}),
            onError: options.onError || (() => {}),
            onComplete: options.onComplete || (() => {}),
            ...options
        };
        
        this.urlParser = new URLParser();
    }
    
    /**
     * Initialize file upload UI components
     * @param {HTMLElement} dropZone - Drag and drop zone element
     * @param {HTMLInputElement} fileInput - File input element
     */
    initializeUI(dropZone, fileInput) {
        // File input change handler
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleFile(file);
            }
        });
        
        // Drag and drop handlers
        dropZone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            
            const file = e.dataTransfer.files[0];
            if (file) {
                this.handleFile(file);
            }
        });
        
        // Click to browse
        dropZone.addEventListener('click', () => {
            fileInput.click();
        });
    }
    
    /**
     * Handle uploaded file
     * @param {File} file - The uploaded file
     */
    async handleFile(file) {
        try {
            // Validate file
            const validation = this.validateFile(file);
            if (!validation.valid) {
                throw new Error(validation.error);
            }
            
            // Report progress
            this.options.onProgress({
                phase: 'reading',
                fileName: file.name,
                fileSize: file.size
            });
            
            // Read file content
            const content = await this.readFile(file);
            
            // Parse URLs based on file type
            this.options.onProgress({
                phase: 'parsing',
                fileName: file.name
            });
            
            const urls = await this.parseFile(file.name, content);
            
            // Validate URL count
            if (urls.length === 0) {
                throw new Error('No valid URLs found in the file');
            }
            
            if (urls.length > this.options.maxUrls) {
                throw new Error(`File contains ${urls.length} URLs, which exceeds the maximum of ${this.options.maxUrls}`);
            }
            
            // Complete
            this.options.onComplete({
                fileName: file.name,
                fileSize: file.size,
                urls: urls,
                urlCount: urls.length
            });
            
        } catch (error) {
            this.options.onError(error);
        }
    }
    
    /**
     * Validate uploaded file
     * @param {File} file - The file to validate
     * @returns {Object} Validation result
     */
    validateFile(file) {
        // Check file size
        if (file.size > this.options.maxFileSize) {
            return {
                valid: false,
                error: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${(this.options.maxFileSize / 1024 / 1024).toFixed(2)}MB)`
            };
        }
        
        // Check file extension
        const extension = '.' + file.name.split('.').pop().toLowerCase();
        if (!this.options.allowedFormats.includes(extension)) {
            return {
                valid: false,
                error: `Invalid file format. Supported formats: ${this.options.allowedFormats.join(', ')}`
            };
        }
        
        return { valid: true };
    }
    
    /**
     * Read file content
     * @param {File} file - The file to read
     * @returns {Promise<string>} File content
     */
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                resolve(e.target.result);
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            
            reader.readAsText(file);
        });
    }
    
    /**
     * Parse file content to extract URLs
     * @param {string} fileName - Name of the file
     * @param {string} content - File content
     * @returns {string[]} Array of URLs
     */
    async parseFile(fileName, content) {
        const extension = '.' + fileName.split('.').pop().toLowerCase();
        
        switch (extension) {
            case '.txt':
                return this.urlParser.parseTXT(content);
            case '.json':
                return this.urlParser.parseJSON(content);
            default:
                throw new Error(`Unsupported file format: ${extension}`);
        }
    }
}

/**
 * URL Parser for different file formats
 */
class URLParser {
    /**
     * Parse TXT file content
     * @param {string} content - File content
     * @returns {string[]} Array of URLs
     */
    parseTXT(content) {
        const urls = [];
        const lines = content.split(/\r?\n/);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines and comments
            if (!line || line.startsWith('#')) {
                continue;
            }
            
            // Basic URL validation
            if (this.isValidURL(line)) {
                urls.push(line);
            }
        }
        
        return urls;
    }
    
    /**
     * Parse JSON file content
     * @param {string} content - File content
     * @returns {string[]} Array of URLs
     */
    parseJSON(content) {
        try {
            const data = JSON.parse(content);
            return this.extractURLsFromJSON(data);
        } catch (error) {
            throw new Error(`Invalid JSON format: ${error.message}`);
        }
    }
    
    /**
     * Extract URLs from JSON data (supports multiple formats)
     * @param {any} data - JSON data
     * @returns {string[]} Array of URLs
     */
    extractURLsFromJSON(data) {
        const urls = [];
        
        // Case 1: Simple array of strings
        if (Array.isArray(data)) {
            for (const item of data) {
                if (typeof item === 'string' && this.isValidURL(item)) {
                    urls.push(item);
                } else if (typeof item === 'object' && item.url && this.isValidURL(item.url)) {
                    // Case 2: Array of objects with 'url' property
                    urls.push(item.url);
                }
            }
        }
        // Case 3: Object with 'urls' property
        else if (typeof data === 'object' && data.urls && Array.isArray(data.urls)) {
            return this.extractURLsFromJSON(data.urls);
        }
        // Case 4: Object with other properties that might contain URLs
        else if (typeof data === 'object') {
            // Look for any property that might contain URLs
            for (const key in data) {
                if (Array.isArray(data[key])) {
                    urls.push(...this.extractURLsFromJSON(data[key]));
                }
            }
        }
        
        return urls;
    }
    
    /**
     * Basic URL validation
     * @param {string} str - String to validate
     * @returns {boolean} True if valid URL
     */
    isValidURL(str) {
        try {
            const url = new URL(str);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    }
}

// Export for browser use
if (typeof window !== 'undefined') {
    window.FileUploadHandler = FileUploadHandler;
    window.URLParser = URLParser;
}
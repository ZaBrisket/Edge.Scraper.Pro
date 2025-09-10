# Cursor Agent Implementation Guide: Bulk URL Upload Feature

## Quick Start Instructions

This guide provides step-by-step instructions for implementing bulk URL upload functionality in the Edge.Scraper.Pro tool. The implementation should be done incrementally, testing each phase before moving to the next.

## Phase 1: File Upload UI Component

### Step 1.1: Add File Upload HTML Structure
**File**: `public/index.html`
**Location**: Replace the existing bulkInputs section (around line 199)

```html
<div id="bulkInputs" class="section">
    <p><b>Instructions:</b> Choose input method and provide URLs for scraping.</p>
    
    <!-- Input Method Toggle -->
    <div class="input-method-toggle" style="margin-bottom: 1em;">
        <label>
            <input type="radio" name="inputMethod" value="textarea" checked>
            Paste URLs (one per line)
        </label>
        <label>
            <input type="radio" name="inputMethod" value="file">
            Upload File (TXT/JSON, up to 1500 URLs)
        </label>
    </div>

    <!-- Textarea Input (existing) -->
    <div id="textareaInput">
        <textarea id="urlList" placeholder="https://example.com/page1&#10;https://example.com/page2"></textarea>
    </div>

    <!-- File Upload Input (new) -->
    <div id="fileInput" style="display: none;">
        <div class="file-upload-area" id="uploadArea">
            <div class="upload-content">
                <div class="upload-icon">📁</div>
                <p>Drag and drop your TXT or JSON file here</p>
                <p>or <button type="button" id="fileSelectBtn">browse files</button></p>
                <p class="file-info">Supports up to 1500 URLs, max 5MB</p>
            </div>
        </div>
        <input type="file" id="fileInputElement" accept=".txt,.json" style="display: none;">
        <div class="file-preview" id="filePreview" style="display: none;">
            <div class="file-details">
                <span class="file-name"></span>
                <span class="file-size"></span>
                <button type="button" id="removeFileBtn">Remove</button>
            </div>
            <div class="url-count" id="urlCount"></div>
        </div>
    </div>

    <div id="validationReport" class="hidden"></div>
    <div id="errorReport" class="hidden"></div>
</div>
```

### Step 1.2: Add CSS Styles
**File**: `public/index.html`
**Location**: Add to the existing `<style>` section (around line 192)

```css
/* File Upload Styles */
.input-method-toggle {
    display: flex;
    gap: 1em;
    margin-bottom: 1em;
}

.input-method-toggle label {
    display: flex;
    align-items: center;
    gap: 0.5em;
    cursor: pointer;
}

.file-upload-area {
    border: 2px dashed #ccc;
    border-radius: 8px;
    padding: 2em;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.3s ease, background-color 0.3s ease;
}

.file-upload-area:hover,
.file-upload-area.dragover {
    border-color: #007bff;
    background-color: #f8f9fa;
}

.upload-content {
    pointer-events: none;
}

.upload-icon {
    font-size: 2em;
    margin-bottom: 0.5em;
}

.file-info {
    font-size: 0.9em;
    color: #666;
    margin-top: 0.5em;
}

.file-preview {
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 1em;
    margin-top: 1em;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.file-details {
    display: flex;
    align-items: center;
    gap: 1em;
}

.file-name {
    font-weight: bold;
}

.file-size {
    color: #666;
    font-size: 0.9em;
}

.url-count {
    font-weight: bold;
    color: #28a745;
}

#removeFileBtn {
    background-color: #dc3545;
    color: white;
    border: none;
    padding: 0.25em 0.5em;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.8em;
}

#removeFileBtn:hover {
    background-color: #c82333;
}
```

### Step 1.3: Add JavaScript for File Upload
**File**: `public/index.html`
**Location**: Add to the existing `<script>` section (around line 255)

```javascript
// File Upload Functionality
class FileUploadHandler {
    constructor() {
        this.maxFileSize = 5 * 1024 * 1024; // 5MB
        this.maxUrls = 1500;
        this.supportedTypes = ['text/plain', 'application/json'];
        this.supportedExtensions = ['.txt', '.json'];
        
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInputElement');
        this.fileSelectBtn = document.getElementById('fileSelectBtn');
        this.filePreview = document.getElementById('filePreview');
        this.fileName = document.querySelector('.file-name');
        this.fileSize = document.querySelector('.file-size');
        this.urlCount = document.getElementById('urlCount');
        this.removeFileBtn = document.getElementById('removeFileBtn');
        this.inputMethodRadios = document.querySelectorAll('input[name="inputMethod"]');
        this.textareaInput = document.getElementById('textareaInput');
        this.fileInputDiv = document.getElementById('fileInput');
    }

    bindEvents() {
        // Input method toggle
        this.inputMethodRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'file') {
                    this.textareaInput.style.display = 'none';
                    this.fileInputDiv.style.display = 'block';
                } else {
                    this.textareaInput.style.display = 'block';
                    this.fileInputDiv.style.display = 'none';
                    this.clearFile();
                }
            });
        });

        // File upload events
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.fileSelectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.fileInput.click();
        });
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));
        this.removeFileBtn.addEventListener('click', () => this.clearFile());

        // Drag and drop events
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });
        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });
        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) this.handleFileSelect(file);
        });
    }

    handleFileSelect(file) {
        if (!file) return;

        // Validate file
        const validation = this.validateFile(file);
        if (!validation.valid) {
            showError(validation.error);
            return;
        }

        // Show file preview
        this.showFilePreview(file);
        
        // Parse file and extract URLs
        this.parseFile(file);
    }

    validateFile(file) {
        // Check file size
        if (file.size > this.maxFileSize) {
            return {
                valid: false,
                error: `File too large. Maximum size is ${this.maxFileSize / 1024 / 1024}MB`
            };
        }

        // Check file type
        const extension = '.' + file.name.split('.').pop().toLowerCase();
        if (!this.supportedExtensions.includes(extension)) {
            return {
                valid: false,
                error: 'Unsupported file type. Please upload a TXT or JSON file.'
            };
        }

        return { valid: true };
    }

    showFilePreview(file) {
        this.fileName.textContent = file.name;
        this.fileSize.textContent = this.formatFileSize(file.size);
        this.filePreview.style.display = 'flex';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async parseFile(file) {
        try {
            const content = await this.readFileContent(file);
            const urls = this.extractUrls(content, file.name);
            
            if (urls.length === 0) {
                showError('No valid URLs found in file');
                return;
            }

            if (urls.length > this.maxUrls) {
                showError(`Too many URLs. Maximum ${this.maxUrls} allowed. Found ${urls.length}.`);
                return;
            }

            this.urlCount.textContent = `${urls.length} URLs found`;
            this.extractedUrls = urls;
            
            // Update the textarea with extracted URLs for processing
            dom.urlList.value = urls.join('\n');
            
        } catch (error) {
            showError(`Error parsing file: ${error.message}`);
        }
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    extractUrls(content, filename) {
        const extension = '.' + filename.split('.').pop().toLowerCase();
        
        if (extension === '.txt') {
            return this.extractUrlsFromTxt(content);
        } else if (extension === '.json') {
            return this.extractUrlsFromJson(content);
        }
        
        return [];
    }

    extractUrlsFromTxt(content) {
        return content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .filter(line => this.isValidUrl(line));
    }

    extractUrlsFromJson(content) {
        try {
            const data = JSON.parse(content);
            let urls = [];

            if (Array.isArray(data)) {
                // Simple array format
                urls = data.filter(item => typeof item === 'string' && this.isValidUrl(item));
            } else if (data.urls && Array.isArray(data.urls)) {
                // Object with URLs property
                urls = data.urls.filter(url => typeof url === 'string' && this.isValidUrl(url));
            } else if (Array.isArray(data) && data.every(item => typeof item === 'object' && item.url)) {
                // Array of objects with URL property
                urls = data
                    .map(item => item.url)
                    .filter(url => typeof url === 'string' && this.isValidUrl(url));
            }

            return urls;
        } catch (error) {
            throw new Error('Invalid JSON format');
        }
    }

    isValidUrl(string) {
        try {
            const url = new URL(string);
            return ['http:', 'https:'].includes(url.protocol);
        } catch {
            return false;
        }
    }

    clearFile() {
        this.filePreview.style.display = 'none';
        this.fileInput.value = '';
        this.extractedUrls = null;
        dom.urlList.value = '';
    }
}

// Initialize file upload handler
const fileUploadHandler = new FileUploadHandler();
```

## Phase 2: Integration with Existing System

### Step 2.1: Update DOM References
**File**: `public/index.html`
**Location**: Update the dom object (around line 259)

```javascript
const dom = {
    bulkInputs: document.getElementById('bulkInputs'),
    urlList: document.getElementById('urlList'),
    scrapeBtn: document.getElementById('scrapeBtn'),
    statusContainer: document.getElementById('statusContainer'),
    statusText: document.getElementById('statusText'),
    errorBox: document.getElementById('errorBox'),
    errorMessage: document.getElementById('errorMessage'),
    resultsContainer: document.getElementById('resultsContainer'),
    resultsCode: document.getElementById('resultsCode'),
    copyBtn: document.getElementById('copyBtn'),
    downloadTxtBtn: document.getElementById('downloadTxtBtn'),
    downloadJsonlBtn: document.getElementById('downloadJsonlBtn'),
    downloadCsvBtn: document.getElementById('downloadCsvBtn'),
    downloadEnhancedCsvBtn: document.getElementById('downloadEnhancedCsvBtn'),
    downloadStructuredJsonBtn: document.getElementById('downloadStructuredJsonBtn'),
    downloadPlayerDbBtn: document.getElementById('downloadPlayerDbBtn'),
    delayInput: document.getElementById('delay'),
    pauseBtn: document.getElementById('pauseBtn'),
    resumeBtn: document.getElementById('resumeBtn'),
    stopBtn: document.getElementById('stopBtn'),
    includeHtmlToggle: document.getElementById('includeHtmlToggle'),
    debugModeToggle: document.getElementById('debugModeToggle'),
    sportsOnlyToggle: document.getElementById('sportsOnlyToggle'),
    validationReport: document.getElementById('validationReport'),
    errorReport: document.getElementById('errorReport'),
    // Add new file upload elements
    fileInput: document.getElementById('fileInput'),
    textareaInput: document.getElementById('textareaInput')
};
```

### Step 2.2: Update URL List Clearing
**File**: `public/index.html`
**Location**: Update the URL list input event listener (around line 1914)

```javascript
// Clear validation report when URL list changes
dom.urlList.addEventListener('input', () => {
    dom.validationReport.classList.add('hidden');
    dom.errorReport.classList.add('hidden');
    pfrValidator.clearCache();
    
    // Clear file preview if textarea is being used
    if (document.querySelector('input[name="inputMethod"]:checked').value === 'textarea') {
        fileUploadHandler.clearFile();
    }
});
```

## Phase 3: Testing and Validation

### Step 3.1: Create Test Files
Create test files to verify the implementation:

**Test File 1: `test-urls.txt`**
```
https://www.pro-football-reference.com/players/M/MahoPa00.htm
https://www.pro-football-reference.com/players/B/BradTo00.htm
https://www.pro-football-reference.com/players/R/RiceJe00.htm
https://example.com/page1
https://example.com/page2
```

**Test File 2: `test-urls.json`**
```json
{
  "urls": [
    "https://www.pro-football-reference.com/players/M/MahoPa00.htm",
    "https://www.pro-football-reference.com/players/B/BradTo00.htm",
    "https://www.pro-football-reference.com/players/R/RiceJe00.htm"
  ],
  "metadata": {
    "source": "test",
    "date": "2024-01-01"
  }
}
```

### Step 3.2: Test Scenarios
1. **File Upload**: Test drag-and-drop and file selection
2. **File Parsing**: Test TXT and JSON parsing
3. **URL Validation**: Test with valid and invalid URLs
4. **Batch Processing**: Test with the extracted URLs
5. **Error Handling**: Test with invalid files and oversized files

## Phase 4: Error Handling and Edge Cases

### Step 4.1: Add Comprehensive Error Handling
**File**: `public/index.html`
**Location**: Add to the FileUploadHandler class

```javascript
// Add these methods to the FileUploadHandler class

handleError(error, context) {
    console.error(`File upload error in ${context}:`, error);
    
    let message = 'An error occurred while processing the file';
    
    if (error.message.includes('File too large')) {
        message = 'File is too large. Maximum size is 5MB.';
    } else if (error.message.includes('Unsupported file type')) {
        message = 'Unsupported file type. Please upload a TXT or JSON file.';
    } else if (error.message.includes('Invalid JSON')) {
        message = 'Invalid JSON format. Please check your file.';
    } else if (error.message.includes('No valid URLs')) {
        message = 'No valid URLs found in the file.';
    } else if (error.message.includes('Too many URLs')) {
        message = `Too many URLs. Maximum ${this.maxUrls} allowed.`;
    }
    
    showError(message);
    this.clearFile();
}

// Update the parseFile method to use error handling
async parseFile(file) {
    try {
        const content = await this.readFileContent(file);
        const urls = this.extractUrls(content, file.name);
        
        if (urls.length === 0) {
            throw new Error('No valid URLs found in file');
        }

        if (urls.length > this.maxUrls) {
            throw new Error(`Too many URLs. Maximum ${this.maxUrls} allowed. Found ${urls.length}.`);
        }

        this.urlCount.textContent = `${urls.length} URLs found`;
        this.extractedUrls = urls;
        
        // Update the textarea with extracted URLs for processing
        dom.urlList.value = urls.join('\n');
        
    } catch (error) {
        this.handleError(error, 'parseFile');
    }
}
```

## Phase 5: Performance Optimization

### Step 5.1: Optimize File Reading
**File**: `public/index.html`
**Location**: Update the readFileContent method

```javascript
readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                resolve(content);
            } catch (error) {
                reject(new Error('Failed to process file content'));
            }
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };
        
        reader.onabort = () => {
            reject(new Error('File reading was aborted'));
        };
        
        // Read as text with UTF-8 encoding
        reader.readAsText(file, 'UTF-8');
    });
}
```

### Step 5.2: Add Progress Indicators
**File**: `public/index.html`
**Location**: Add to the file upload area

```html
<div class="file-processing" id="fileProcessing" style="display: none;">
    <div class="spinner"></div>
    <p>Processing file...</p>
</div>
```

```javascript
// Add to FileUploadHandler class
showProcessing() {
    document.getElementById('fileProcessing').style.display = 'block';
}

hideProcessing() {
    document.getElementById('fileProcessing').style.display = 'none';
}

// Update parseFile method
async parseFile(file) {
    this.showProcessing();
    try {
        // ... existing code ...
    } catch (error) {
        this.handleError(error, 'parseFile');
    } finally {
        this.hideProcessing();
    }
}
```

## Final Testing Checklist

- [ ] File upload UI appears and functions correctly
- [ ] Drag-and-drop works for TXT and JSON files
- [ ] File validation works (size, type)
- [ ] TXT file parsing extracts URLs correctly
- [ ] JSON file parsing handles multiple formats
- [ ] URL validation works for extracted URLs
- [ ] Batch processing works with file-extracted URLs
- [ ] Error handling works for all error cases
- [ ] UI toggles between textarea and file upload modes
- [ ] All existing functionality remains intact
- [ ] Performance is acceptable for large files (up to 1500 URLs)

## Notes for Implementation

1. **Incremental Development**: Implement each phase separately and test thoroughly before moving to the next phase.

2. **Error Handling**: The existing error handling system should be used for consistency.

3. **UI Consistency**: The new file upload UI should match the existing brutalist design theme.

4. **Performance**: For very large files, consider implementing chunked processing to prevent UI blocking.

5. **Browser Compatibility**: Test across different browsers to ensure compatibility.

6. **Memory Management**: Clean up file data after processing to prevent memory leaks.

This implementation guide provides a complete roadmap for adding bulk URL upload functionality while maintaining the existing system's reliability and user experience.
# Bulk URL Upload Feature Enhancement Task

## Overview
Enhance the Edge.Scraper.Pro tool to support bulk URL upload via file upload functionality, allowing users to upload TXT or JSON files containing up to 1500 URLs for batch processing.

## Current System Analysis
The existing tool has:
- Single-file HTML application (`public/index.html`) with textarea input
- Batch processing system (`public/batch-processor.js`) with validation and error handling
- PFR validator (`public/pfr-validator.js`) for sports URL validation
- Netlify function backend (`netlify/functions/fetch-url.js`) for secure URL fetching
- Support for up to 100+ URLs in textarea (sequential processing)

## Requirements

### 1. File Upload UI Component
**Location**: `public/index.html` (integrate into existing UI)

**Features**:
- Drag-and-drop file upload area
- File type validation (TXT, JSON only)
- File size validation (max 5MB to accommodate 1500 URLs)
- Clear visual feedback for file selection
- Option to switch between textarea input and file upload
- Progress indicator for file processing

**UI Design**:
```html
<div class="file-upload-section">
  <div class="upload-area" id="uploadArea">
    <div class="upload-content">
      <svg class="upload-icon">...</svg>
      <p>Drag and drop your TXT or JSON file here</p>
      <p>or <button type="button" id="fileSelectBtn">browse files</button></p>
      <p class="file-info">Supports up to 1500 URLs, max 5MB</p>
    </div>
  </div>
  <input type="file" id="fileInput" accept=".txt,.json" style="display: none;">
  <div class="file-preview" id="filePreview" style="display: none;">
    <div class="file-details">
      <span class="file-name"></span>
      <span class="file-size"></span>
      <button type="button" id="removeFileBtn">Remove</button>
    </div>
    <div class="url-count" id="urlCount"></div>
  </div>
</div>
```

### 2. File Parser Implementation
**Location**: `public/file-parser.js` (new file)

**Features**:
- Parse TXT files (one URL per line)
- Parse JSON files (array of URLs or object with URLs property)
- Extract and normalize URLs from various JSON structures
- Validate file format and content
- Return structured data with URL list and metadata

**JSON Format Support**:
```javascript
// Format 1: Simple array
["https://example.com/1", "https://example.com/2"]

// Format 2: Object with URLs property
{
  "urls": ["https://example.com/1", "https://example.com/2"],
  "metadata": { "source": "export", "date": "2024-01-01" }
}

// Format 3: Object array with URL property
[
  { "url": "https://example.com/1", "title": "Page 1" },
  { "url": "https://example.com/2", "title": "Page 2" }
]
```

**Parser Class Structure**:
```javascript
class FileParser {
  constructor() {
    this.supportedFormats = ['txt', 'json'];
    this.maxFileSize = 5 * 1024 * 1024; // 5MB
    this.maxUrls = 1500;
  }

  async parseFile(file) {
    // Validate file type and size
    // Parse based on file extension
    // Extract URLs and validate format
    // Return structured result
  }

  parseTxtFile(content) {
    // Split by lines, filter empty lines
    // Return array of URLs
  }

  parseJsonFile(content) {
    // Parse JSON, extract URLs from various structures
    // Handle different JSON formats
    // Return array of URLs with metadata
  }

  validateUrls(urls) {
    // Basic URL format validation
    // Check for duplicates
    // Return validation result
  }
}
```

### 3. Enhanced URL Validation
**Location**: Extend `public/batch-processor.js` and `public/pfr-validator.js`

**Features**:
- Handle bulk URL validation (up to 1500 URLs)
- Categorize validation results by type
- Provide detailed feedback for invalid URLs
- Support both sports and general URL validation
- Optimize validation performance for large batches

**Validation Categories**:
- Valid URLs (ready for processing)
- Invalid URLs (malformed, wrong domain, etc.)
- Duplicate URLs (with reference to first occurrence)
- Potentially problematic URLs (timeout-prone, rate-limited)

### 4. Batch Processing Integration
**Location**: `public/index.html` (main application logic)

**Features**:
- Integrate file upload with existing batch processor
- Maintain existing processing controls (pause, resume, stop)
- Preserve order of URLs from file
- Handle large batches efficiently
- Provide progress tracking for file processing phase

**Integration Points**:
```javascript
// In main application
const fileParser = new FileParser();
const batchProcessor = new BatchProcessor({
  concurrency: 1, // Keep sequential for reliability
  delayMs: parseInt(dom.delayInput.value, 10),
  timeout: TIMEOUT_MS,
  onProgress: handleProgress,
  onError: handleError,
  onComplete: handleComplete
});

// File upload handler
async function handleFileUpload(file) {
  try {
    const parseResult = await fileParser.parseFile(file);
    if (parseResult.urls.length > 1500) {
      throw new Error('Too many URLs. Maximum 1500 allowed.');
    }
    
    // Use existing batch processing
    const result = await batchProcessor.processBatch(
      parseResult.urls,
      processUrlFunction
    );
    
    // Handle results as usual
    handleBatchComplete(result);
  } catch (error) {
    showError(`File processing error: ${error.message}`);
  }
}
```

### 5. Error Handling and User Feedback
**Location**: Throughout the application

**Features**:
- File upload error handling (size, type, format)
- Parsing error handling (malformed JSON, invalid URLs)
- Processing error handling (network, timeout, rate limits)
- User-friendly error messages
- Detailed error reporting for debugging

**Error Categories**:
- File errors (size, type, format)
- Parsing errors (malformed JSON, encoding issues)
- Validation errors (invalid URLs, duplicates)
- Processing errors (network, timeout, server errors)

### 6. Performance Optimization
**Location**: `public/batch-processor.js` and main application

**Features**:
- Efficient file parsing for large files
- Optimized URL validation for bulk processing
- Memory management for large URL lists
- Progress tracking for long-running operations
- Chunked processing to prevent UI blocking

**Optimization Strategies**:
- Stream file reading for large files
- Batch URL validation in chunks
- Use Web Workers for heavy processing (optional)
- Implement progress callbacks for UI updates
- Memory cleanup after processing

### 7. UI/UX Enhancements
**Location**: `public/index.html` (CSS and JavaScript)

**Features**:
- Toggle between textarea and file upload modes
- Visual file upload area with drag-and-drop
- File preview with URL count and validation status
- Progress indicators for file processing
- Clear error messages and recovery options

**CSS Additions**:
```css
.file-upload-section {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 2em;
  text-align: center;
  margin-bottom: 1em;
  transition: border-color 0.3s ease;
}

.file-upload-section.dragover {
  border-color: #007bff;
  background-color: #f8f9fa;
}

.upload-area {
  cursor: pointer;
}

.file-preview {
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 1em;
  margin-top: 1em;
}

.url-count {
  font-weight: bold;
  color: #28a745;
}
```

## Implementation Steps

### Phase 1: File Upload UI
1. Add file upload HTML structure to `public/index.html`
2. Implement drag-and-drop functionality
3. Add file validation (type, size)
4. Create file preview component
5. Add toggle between textarea and file upload modes

### Phase 2: File Parser
1. Create `public/file-parser.js` with FileParser class
2. Implement TXT file parsing (one URL per line)
3. Implement JSON file parsing (multiple formats)
4. Add URL extraction and validation
5. Add error handling for malformed files

### Phase 3: Integration
1. Integrate file parser with existing batch processor
2. Update main application logic to handle file uploads
3. Maintain existing processing controls and UI
4. Add progress tracking for file processing phase

### Phase 4: Testing and Optimization
1. Test with various file formats and sizes
2. Test with maximum 1500 URLs
3. Optimize performance for large batches
4. Add comprehensive error handling
5. Test edge cases and error scenarios

## File Structure Changes

### New Files
- `public/file-parser.js` - File parsing and URL extraction
- `public/test-bulk-upload.html` - Testing page for bulk upload feature

### Modified Files
- `public/index.html` - Add file upload UI and integration
- `public/batch-processor.js` - Enhance for bulk processing (if needed)
- `public/pfr-validator.js` - Optimize for bulk validation (if needed)

## Testing Requirements

### Test Cases
1. **File Upload**:
   - Valid TXT file with 100 URLs
   - Valid JSON file with 500 URLs
   - Invalid file type (reject)
   - File too large (reject)
   - Empty file (handle gracefully)

2. **File Parsing**:
   - TXT file with one URL per line
   - JSON array format
   - JSON object with URLs property
   - Malformed JSON (error handling)
   - Mixed valid/invalid URLs

3. **Bulk Processing**:
   - 1500 valid URLs (maximum)
   - Mix of sports and general URLs
   - URLs with duplicates
   - URLs with validation errors
   - Network errors during processing

4. **Performance**:
   - Large file upload (5MB)
   - Processing 1500 URLs
   - Memory usage during processing
   - UI responsiveness during processing

## Success Criteria
- [ ] Users can upload TXT and JSON files with up to 1500 URLs
- [ ] File upload integrates seamlessly with existing batch processing
- [ ] All existing functionality remains intact
- [ ] Performance is acceptable for maximum batch size
- [ ] Error handling is comprehensive and user-friendly
- [ ] UI is intuitive and provides clear feedback
- [ ] Processing maintains reliability and rate limiting

## Technical Considerations

### Memory Management
- Stream large file reading to prevent memory issues
- Clean up file data after processing
- Implement chunked processing for very large batches

### Browser Compatibility
- Use modern File API features
- Provide fallback for older browsers
- Test across different browsers and devices

### Security
- Validate file types server-side (if applicable)
- Sanitize file content before processing
- Prevent XSS through file content

### Performance
- Use efficient algorithms for URL validation
- Implement progress callbacks for UI updates
- Consider Web Workers for heavy processing
- Optimize memory usage for large batches

This task provides a comprehensive enhancement to the existing scraping tool while maintaining all current functionality and adding robust bulk upload capabilities.
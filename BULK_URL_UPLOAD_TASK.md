# Bulk URL Upload Enhancement Task

## Overview
Enhance the Edge.Scraper.Pro tool to support bulk URL upload via TXT or JSON files, enabling users to upload and process up to 1500 URLs at once. This feature should integrate seamlessly with the existing sports-specific scraping capabilities and batch processing system.

## Current System Analysis

### Existing Architecture
- **Frontend**: Single-file HTML application (`/public/index.html`) with brutalist UI
- **Backend**: Netlify Functions with enhanced HTTP client and rate limiting
- **Batch Processing**: Existing `BatchProcessor` class in `/src/lib/batch-processor.js`
- **Sports Features**: Advanced sports content extraction and validation
- **URL Validation**: PFR validator for sports URLs with comprehensive validation reports

### Key Integration Points
1. **UI Layer**: Current textarea input in `index.html` (lines 200-204)
2. **Batch Processor**: `/src/lib/batch-processor.js` handles concurrent processing
3. **URL Validation**: `/src/lib/pfr-validator.js` and `/public/pfr-validator.js`
4. **Progress Tracking**: Existing progress callbacks and UI updates

## Requirements

### Core Functionality
1. **File Upload Interface**
   - Support TXT files (one URL per line)
   - Support JSON files (array of URLs or structured format)
   - File size limit validation (reasonable for 1500 URLs)
   - Drag-and-drop functionality
   - File format auto-detection

2. **URL Processing Engine**
   - Parse TXT files: extract URLs from each line, ignore empty lines/comments
   - Parse JSON files: support multiple formats (array, object with URLs array, etc.)
   - URL normalization and cleaning (existing `cleanUrl` function)
   - Duplicate detection and removal
   - Invalid URL filtering with detailed reporting

3. **Batch Processing Enhancement**
   - Handle up to 1500 URLs efficiently
   - Maintain existing rate limiting and reliability features
   - Progress tracking with pause/resume capability
   - Error handling and retry logic
   - Memory optimization for large batches

4. **User Experience**
   - Clear progress indicators for file processing stages
   - Validation report before processing begins
   - Option to review and edit URL list before scraping
   - Export capabilities for processed results

### Technical Specifications

#### File Format Support

**TXT Format:**
```
# Comments starting with # are ignored
https://www.pro-football-reference.com/players/M/MahoPa00.htm
https://www.pro-football-reference.com/players/B/BradTo00.htm

# Empty lines are ignored
https://www.basketball-reference.com/players/j/jamesle01.html
```

**JSON Format Options:**
```json
{
  "urls": [
    "https://www.pro-football-reference.com/players/M/MahoPa00.htm",
    "https://www.pro-football-reference.com/players/B/BradTo00.htm"
  ]
}
```

Or simple array:
```json
[
  "https://www.pro-football-reference.com/players/M/MahoPa00.htm",
  "https://www.pro-football-reference.com/players/B/BradTo00.htm"
]
```

#### Performance Requirements
- Support up to 1500 URLs per upload
- File parsing should complete within 5 seconds for max size
- Memory usage should remain reasonable (< 100MB for URL processing)
- Maintain existing sequential processing for reliability

## Implementation Plan

### Phase 1: File Upload UI Enhancement
**Location**: `/public/index.html`

1. **Add File Upload Section** (after line 204)
   ```html
   <div class="file-upload-section">
     <h3>Upload URL File</h3>
     <div class="upload-area" id="uploadArea">
       <input type="file" id="fileInput" accept=".txt,.json" style="display: none;">
       <div class="upload-prompt">
         <p>Drag and drop a TXT or JSON file here, or <button id="browseBtn">Browse Files</button></p>
         <p class="file-info">Supports up to 1500 URLs • TXT (one per line) • JSON (array format)</p>
       </div>
       <div id="filePreview" class="hidden">
         <h4>File Preview:</h4>
         <div id="fileDetails"></div>
         <button id="processFileBtn">Process URLs</button>
         <button id="clearFileBtn">Clear</button>
       </div>
     </div>
   </div>
   ```

2. **Add CSS Styles** (in style section)
   ```css
   .file-upload-section {
     border: 1px solid #000;
     padding: 1em;
     margin-bottom: 1em;
   }
   
   .upload-area {
     border: 2px dashed #ccc;
     padding: 2em;
     text-align: center;
     transition: border-color 0.3s;
   }
   
   .upload-area.dragover {
     border-color: #000;
     background-color: #f9f9f9;
   }
   
   .file-info {
     font-size: 0.9em;
     color: #666;
   }
   
   .file-preview {
     background-color: #f5f5f5;
     padding: 1em;
     margin-top: 1em;
     text-align: left;
   }
   ```

### Phase 2: File Processing Engine
**Location**: New JavaScript functions in `/public/index.html`

1. **File Reader Class**
   ```javascript
   class URLFileProcessor {
     constructor() {
       this.maxUrls = 1500;
       this.maxFileSize = 5 * 1024 * 1024; // 5MB
     }
     
     async processFile(file) {
       // Validate file size and type
       // Read file content
       // Parse based on extension
       // Return { urls: [], errors: [], warnings: [] }
     }
     
     parseTxtFile(content) {
       // Parse line by line, ignore comments and empty lines
     }
     
     parseJsonFile(content) {
       // Support multiple JSON formats
     }
     
     validateUrls(urls) {
       // Use existing validation logic
     }
   }
   ```

2. **Integration with Existing Validation**
   ```javascript
   // Extend existing PFR validator integration
   async function processUploadedFile(file) {
     const processor = new URLFileProcessor();
     const result = await processor.processFile(file);
     
     if (result.urls.length > 0) {
       // Populate URL list textarea
       dom.urlList.value = result.urls.join('\n');
       
       // Trigger existing validation
       const validationResult = pfrValidator.validateBatch(result.urls);
       // Display validation report
     }
   }
   ```

### Phase 3: Batch Processing Enhancement
**Location**: `/src/lib/batch-processor.js`

1. **Memory Optimization**
   ```javascript
   // Add chunked processing for large batches
   async processBatchInChunks(urls, processor, chunkSize = 50) {
     // Process URLs in chunks to manage memory
     // Maintain progress tracking across chunks
   }
   ```

2. **Progress Enhancement**
   ```javascript
   // Enhanced progress reporting for file upload workflow
   const progressStages = {
     FILE_READING: 'Reading file...',
     URL_PARSING: 'Parsing URLs...',
     URL_VALIDATION: 'Validating URLs...',
     BATCH_PROCESSING: 'Processing URLs...'
   };
   ```

### Phase 4: User Experience Enhancements
**Location**: `/public/index.html` JavaScript section

1. **File Upload Handlers**
   ```javascript
   // Drag and drop functionality
   function setupFileUpload() {
     const uploadArea = dom.uploadArea;
     
     uploadArea.addEventListener('dragover', handleDragOver);
     uploadArea.addEventListener('drop', handleFileDrop);
     dom.browseBtn.addEventListener('click', () => dom.fileInput.click());
     dom.fileInput.addEventListener('change', handleFileSelect);
   }
   ```

2. **Progress Visualization**
   ```javascript
   // Enhanced progress display for file processing
   function showFileProcessingProgress(stage, progress) {
     // Update UI with current stage and progress percentage
   }
   ```

## Integration Points

### With Existing Features
1. **Sports Validation**: File-uploaded URLs should work with existing PFR validator
2. **Export Functions**: All existing export formats (Enhanced CSV, Structured JSON, Player DB) should work
3. **Error Handling**: Integrate with existing error boundary and reporting system
4. **Rate Limiting**: Maintain existing per-host rate limiting for uploaded URLs

### API Considerations
- No backend changes required initially
- File processing happens client-side
- Existing Netlify functions handle URL scraping

## Testing Strategy

### Unit Tests
1. **File Parser Tests**
   ```javascript
   // Test TXT parsing with various formats
   // Test JSON parsing with different structures
   // Test error handling for invalid files
   ```

2. **Integration Tests**
   ```javascript
   // Test with existing batch processor
   // Test with sports validation
   // Test with export functions
   ```

### Performance Tests
1. **Large File Handling**
   - Test with 1500 URL files
   - Memory usage monitoring
   - Processing time benchmarks

2. **Error Scenarios**
   - Invalid file formats
   - Oversized files
   - Network errors during processing

## Success Criteria

### Functional Requirements
- [ ] Successfully upload and parse TXT files with up to 1500 URLs
- [ ] Successfully upload and parse JSON files with multiple format support
- [ ] Integrate seamlessly with existing validation and batch processing
- [ ] Maintain all existing export functionality
- [ ] Provide clear progress indicators and error reporting

### Performance Requirements
- [ ] Parse 1500 URLs within 5 seconds
- [ ] Memory usage stays under 100MB during file processing
- [ ] No degradation of existing scraping performance

### User Experience Requirements
- [ ] Intuitive drag-and-drop interface
- [ ] Clear file format documentation
- [ ] Helpful error messages and validation reports
- [ ] Consistent with existing brutalist UI theme

## Implementation Notes

### File Size Considerations
- TXT file with 1500 URLs (~100 chars each): ~150KB
- JSON file with same URLs: ~200KB
- 5MB limit provides generous buffer

### Memory Management
- Process URLs in chunks to avoid memory spikes
- Clear intermediate data structures after processing
- Use streaming for large file reading if needed

### Error Handling Strategy
- Graceful degradation: partial URL lists should still work
- Clear error messages for common issues (file too large, invalid format)
- Fallback to manual URL entry if file processing fails

## Future Enhancements

### Phase 2 Features (Future)
1. **Cloud Storage Integration**: Save/load URL lists from cloud storage
2. **URL List Templates**: Pre-defined URL patterns for common scraping tasks
3. **Scheduled Processing**: Queue large batches for processing during off-peak hours
4. **Advanced JSON Support**: Support for metadata in JSON files (categories, priorities)

### Performance Optimizations
1. **Web Workers**: Move file processing to web worker for better UI responsiveness
2. **Streaming Processing**: Process URLs as they're parsed instead of batch loading
3. **Caching**: Cache parsed URL lists for repeated processing

## Dependencies

### Existing Code to Leverage
- `BatchProcessor` class: Core batch processing logic
- `PFRValidator`: URL validation and reporting
- `cleanUrl()` function: URL normalization
- Export functions: All existing export formats
- Error handling: Existing error boundary system

### New Dependencies (None Required)
- All functionality can be implemented with vanilla JavaScript
- No additional npm packages needed
- Maintains existing zero-dependency frontend approach

## Deployment Considerations

### Testing Approach
1. **Local Development**: Test with various file formats and sizes
2. **Staging**: Validate integration with existing Netlify functions
3. **Production**: Gradual rollout with monitoring

### Rollback Plan
- Feature can be disabled by hiding file upload UI
- Existing manual URL entry remains unchanged
- No breaking changes to existing functionality

This enhancement will significantly improve the usability of the Edge.Scraper.Pro tool while maintaining its reliability and performance characteristics. The implementation preserves the existing brutalist UI aesthetic and integrates seamlessly with the sophisticated sports scraping capabilities.
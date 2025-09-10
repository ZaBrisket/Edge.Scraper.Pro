# Task: Add File Upload Feature for Bulk URL Scraping

## Overview
Enhance the Edge.Scraper.Pro tool to support uploading TXT or JSON files containing URLs for bulk scraping. The feature should handle up to 1,500 URLs at once, with proper validation, parsing, and processing capabilities.

## Background
Currently, users must manually paste URLs into a textarea (one per line). This task adds the ability to upload files containing URLs, making it easier to process large batches of URLs efficiently.

## Technical Requirements

### 1. File Upload Interface
- Add a file input element to accept `.txt` and `.json` files
- Support drag-and-drop functionality for better UX
- Display file information (name, size, URL count) after upload
- Provide clear visual feedback during file processing

### 2. File Parsing
Support two file formats:

#### TXT Format
- One URL per line
- Ignore empty lines and lines starting with `#` (comments)
- Trim whitespace from each line
- Example:
  ```
  https://example.com/page1
  https://example.com/page2
  # This is a comment
  https://example.com/page3
  ```

#### JSON Format
Support multiple structures:
- Simple array: `["url1", "url2", "url3"]`
- Object array: `[{"url": "url1"}, {"url": "url2"}]`
- Nested structure: `{"urls": ["url1", "url2", "url3"]}`
- Extended format with metadata:
  ```json
  {
    "urls": [
      {
        "url": "https://example.com/page1",
        "name": "Page 1",
        "category": "sports"
      }
    ]
  }
  ```

### 3. URL Validation & Processing
- Leverage existing `pfrValidator` for URL validation
- Maintain all current validation features:
  - Invalid URL detection
  - Duplicate URL removal
  - Sports URL filtering (if enabled)
  - Domain-specific validation
- Display validation report before processing
- Allow users to review and confirm the URL list

### 4. Capacity Handling
- Support up to 1,500 URLs per upload
- Implement client-side file size limits (e.g., 5MB)
- Show progress indicator for large file parsing
- Implement chunked processing for large batches
- Maintain current rate limiting and delay settings

### 5. User Experience Enhancements
- Show upload progress for large files
- Display parsed URL count before processing
- Allow editing of parsed URLs before scraping
- Option to merge uploaded URLs with manually entered URLs
- Clear error messages for unsupported formats
- Save uploaded file information for reference

### 6. Error Handling
- Validate file format before parsing
- Handle malformed JSON gracefully
- Report specific parsing errors with line numbers
- Allow partial processing of valid URLs from problematic files
- Implement retry logic for failed URL extractions

## Implementation Plan

### Phase 1: UI Components
1. Add file input element below the current textarea
2. Style the upload area with drag-and-drop zone
3. Add file info display component
4. Create upload progress indicator

### Phase 2: File Parsing Logic
1. Implement TXT file parser
2. Implement JSON file parser with multiple format support
3. Add file format detection
4. Create unified URL extraction interface

### Phase 3: Integration
1. Connect file parser to existing validation pipeline
2. Merge file URLs with manual input
3. Update the `runBulkScrape` function to handle file uploads
4. Ensure order preservation throughout the pipeline

### Phase 4: Capacity & Performance
1. Implement 1,500 URL limit with user notification
2. Add chunked processing for large batches
3. Optimize memory usage for large files
4. Add progress tracking for file parsing

### Phase 5: Testing & Polish
1. Test with various file formats and sizes
2. Verify sports URL validation works with uploads
3. Test error scenarios (malformed files, mixed content)
4. Add comprehensive error messages
5. Update documentation

## Code Structure

### New Components to Create:
1. `FileUploadHandler` class in `/public/file-upload.js`
2. `URLParser` class for handling different file formats
3. UI components for file upload in `index.html`

### Existing Components to Modify:
1. `index.html` - Add file upload UI
2. `batch-processor.js` - Ensure compatibility with large batches
3. `runBulkScrape()` - Integrate file upload flow

## UI Mockup

```
┌─────────────────────────────────────────┐
│  AI Web Scraper                         │
├─────────────────────────────────────────┤
│  Paste URLs (one per line):            │
│  ┌─────────────────────────────────┐   │
│  │ [textarea for manual entry]      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Or upload a file:                      │
│  ┌─────────────────────────────────┐   │
│  │  📁 Drop file here or click to   │   │
│  │     browse (.txt or .json)       │   │
│  │                                  │   │
│  │  Supports up to 1,500 URLs      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [✓] Merge with manual URLs            │
│  [✓] Validate URLs before scraping     │
│                                         │
│  [Scrape] [Clear]                      │
└─────────────────────────────────────────┘
```

## Success Criteria
1. Users can upload .txt and .json files containing URLs
2. System correctly parses and validates all supported formats
3. Up to 1,500 URLs can be processed in a single batch
4. File upload integrates seamlessly with existing validation
5. Clear error messages for unsupported formats or invalid files
6. Performance remains acceptable with large URL batches
7. All existing features continue to work as expected

## Testing Scenarios
1. Upload a .txt file with 100 valid URLs
2. Upload a .json file with nested URL structure
3. Upload a file with 1,500 URLs (maximum capacity)
4. Upload a file with 2,000 URLs (over capacity)
5. Upload a malformed JSON file
6. Upload a file with mixed valid/invalid URLs
7. Upload a file with duplicate URLs
8. Test drag-and-drop functionality
9. Test merging uploaded URLs with manual entries
10. Test with sports-specific URLs and validation enabled

## Documentation Updates
1. Update README.md with file upload instructions
2. Add examples of supported file formats
3. Document the 1,500 URL limit
4. Create a sample URLs file for users to test with

## Future Enhancements (Out of Scope)
- CSV file support
- Excel file support
- URL list templates
- Batch file processing (multiple files)
- Cloud storage integration
- URL list sharing/collaboration features

## Notes for Implementation
- Maintain backward compatibility with manual URL entry
- Ensure the existing rate limiting still applies
- Keep the current sequential processing mode for reliability
- Preserve all existing export formats and options
- Consider memory usage with large files on client-side
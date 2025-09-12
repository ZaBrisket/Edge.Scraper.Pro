# EdgeScraperPro Modes System

## Overview

EdgeScraperPro uses a pluggable mode architecture that allows specialized extraction logic for different types of content. Each mode implements a standard contract and can be easily added, modified, or removed without affecting the core system.

## Available Modes

### 1. News Articles Mode (`news-articles`)

**Purpose**: Extract article metadata and content from news article URLs

**Features**:
- Article title, author/byline, publication date extraction
- Content extraction with configurable length limits
- Image extraction with captions
- Tag and category detection
- Reading time calculation
- Multiple date format options

**Input Options**:
```typescript
{
  urls: string[];
  options?: {
    extractContent?: boolean;     // Extract full article content
    extractImages?: boolean;      // Extract article images
    maxContentLength?: number;    // Max content length (100-50000)
    dateFormat?: 'iso' | 'timestamp' | 'human';
    concurrency?: number;         // 1-20, default: 5
    delayMs?: number;            // 0-10000, default: 500
  };
}
```

**Performance**: ~1.5s per URL, max 1000 URLs per batch

**Example URLs**:
- `https://www.bbc.com/news/world-12345678`
- `https://www.cnn.com/2024/01/15/politics/news-story/`
- `https://www.reuters.com/world/article-title-2024-01-15/`

### 2. Sports Statistics Mode (`sports`)

**Purpose**: Extract player statistics and biographical data from sports reference sites

**Features**:
- Player name, position, team extraction
- Statistics tables parsing
- Biographical information
- Career achievements and awards
- Site-specific optimizations (Pro Football Reference, Basketball Reference, etc.)
- Respectful rate limiting for sports sites

**Input Options**:
```typescript
{
  urls: string[];
  options?: {
    extractTables?: boolean;       // Extract statistics tables
    extractBiography?: boolean;    // Extract biographical data
    extractAchievements?: boolean; // Extract awards/achievements
    sportsSite?: 'auto' | 'pro-football-reference' | ...;
    concurrency?: number;          // 1-5, default: 2 (conservative)
    delayMs?: number;             // 1000-10000, default: 2000
  };
}
```

**Performance**: ~3s per URL, max 200 URLs per batch

**Example URLs**:
- `https://www.pro-football-reference.com/players/M/MahoPa00.htm`
- `https://www.basketball-reference.com/players/j/jamesle01.html`
- `https://www.baseball-reference.com/players/t/troutmi01.shtml`

### 3. Supplier Directory Mode (`supplier-directory`)

**Purpose**: Extract company listings from supplier directory pages

**Features**:
- Company name, website, contact information extraction
- Automatic pagination discovery
- URL normalization (HTTP→HTTPS, www variants)
- Business category and description extraction
- Support for various directory formats

**Input Options**:
```typescript
{
  urls: string[];
  options?: {
    enablePaginationDiscovery?: boolean; // Auto-discover additional pages
    enableUrlNormalization?: boolean;    // Normalize URLs for better success
    extractionDepth?: 'basic' | 'detailed';
    concurrency?: number;                // 1-20, default: 3
    delayMs?: number;                   // 0-10000, default: 1000
  };
}
```

**Performance**: ~2s per URL, max 500 URLs per batch

**Example URLs**:
- `https://www.d2pbuyersguide.com/filter/all/page/1`
- `https://directory.example.com/suppliers`
- `https://business-directory.com/companies`

## Mode Architecture

### Mode Contract

Each mode must implement the `ModeContract` interface:

```typescript
interface ModeContract {
  // Identification
  id: string;
  label: string;
  description?: string;
  version: string;

  // Validation schemas
  inputSchema: z.ZodSchema<any>;
  outputSchema: z.ZodSchema<any>;

  // UI configuration
  uiHints: ModeUIHints;

  // Core methods
  run(input: any, ctx: ModeContext): Promise<any>;
  validate?(input: any): Promise<{ valid: boolean; errors?: string[] }>;
  transform?(output: any, input: any): Promise<any>;
}
```

### UI Hints

UI hints provide configuration for the web interface:

```typescript
interface ModeUIHints {
  inputType: 'urls' | 'file' | 'text' | 'mixed';
  supportsBatch: boolean;
  supportsProgress: boolean;
  estimatedTimePerUrl?: number;
  maxBatchSize?: number;
  fileFormats?: string[];
  placeholder?: string;
  helpText?: string;
  examples?: string[];
}
```

### Mode Context

The context provided to mode execution:

```typescript
interface ModeContext {
  jobId: string;
  correlationId: string;
  logger: any;
  httpClient: any;
  structuredLogger?: any;
  abortSignal?: AbortSignal;
}
```

## Adding a New Mode

### 1. Create the Mode Class

```typescript
// src/modes/my-new-mode.ts
import { z } from 'zod';
import { ModeContract, ModeContext } from './types';

const MyModeInputSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(100),
  options: z.object({
    // Define your options here
  }).optional().default({}),
});

const MyModeOutputSchema = z.object({
  // Define your output structure
});

export class MyNewMode implements ModeContract {
  public readonly id = 'my-new-mode';
  public readonly label = 'My New Mode';
  public readonly description = 'Description of what this mode does';
  public readonly version = '1.0.0';

  public readonly inputSchema = MyModeInputSchema;
  public readonly outputSchema = MyModeOutputSchema;

  public readonly uiHints = {
    inputType: 'urls' as const,
    supportsBatch: true,
    supportsProgress: true,
    estimatedTimePerUrl: 1000,
    maxBatchSize: 100,
    helpText: 'Instructions for users',
    examples: ['https://example.com/sample-url'],
  };

  async run(input: any, ctx: ModeContext): Promise<any> {
    // Implement your extraction logic here
    return {
      results: [],
      summary: { total: 0, successful: 0, failed: 0 },
    };
  }

  async validate(input: any): Promise<{ valid: boolean; errors?: string[] }> {
    // Optional: custom validation logic
    return { valid: true };
  }
}
```

### 2. Register the Mode

Add your mode to the registry in `src/modes/index.ts`:

```typescript
import { MyNewMode } from './my-new-mode';

export function initializeModes(): void {
  // ... existing modes
  const myNewMode = new MyNewMode();
  modeRegistry.register(myNewMode);
}
```

### 3. Add UI Page (Optional)

Create a page for your mode in `pages/scrape/my-mode.tsx` following the pattern of existing pages.

### 4. Write Tests

Create tests for your mode:

```typescript
// tests/my-new-mode.test.js
describe('My New Mode', () => {
  test('should validate input correctly', async () => {
    // Test validation logic
  });

  test('should process URLs correctly', async () => {
    // Test processing logic
  });
});
```

## Best Practices

### Performance
- Use appropriate concurrency limits for your target sites
- Implement respectful delays between requests
- Consider rate limiting for popular sites
- Optimize for batch processing efficiency

### Error Handling
- Provide meaningful error messages
- Categorize errors appropriately
- Handle network timeouts gracefully
- Log errors with sufficient context

### Data Quality
- Validate extracted data
- Normalize data formats consistently
- Handle edge cases and malformed content
- Provide confidence scores when possible

### Testing
- Test with real URLs (use fixtures for CI/CD)
- Test error conditions and edge cases
- Verify schema compliance
- Test UI integration

## Troubleshooting

### Common Issues

**Mode not appearing in UI**:
- Ensure mode is registered in `initializeModes()`
- Check that mode implements `ModeContract` correctly
- Verify mode is enabled in registry

**Validation errors**:
- Check input schema matches expected format
- Verify all required fields are provided
- Test schema with sample data

**Performance issues**:
- Reduce concurrency for resource-intensive sites
- Increase delays between requests
- Check for memory leaks in extraction logic
- Monitor structured logs for bottlenecks

**Extraction failures**:
- Verify selectors work with target sites
- Handle dynamic content and JavaScript rendering
- Check for anti-bot measures
- Test with different user agents

### Debugging

Enable verbose logging:
```bash
DEBUG=edge-scraper:* npm run dev
```

Check structured logs:
```bash
tail -f logs/job-*.log
```

Test mode in isolation:
```typescript
const mode = modeRegistry.getMode('my-mode');
const result = await mode.run(testInput, testContext);
```

## Migration Guide

### From Legacy Extractors

If migrating from the old extractor system:

1. **Wrap existing logic** in the new mode contract
2. **Update input/output schemas** to match new format
3. **Add UI hints** for proper interface integration
4. **Test thoroughly** with existing URLs
5. **Update CLI mappings** in cli-adapter.ts

### Breaking Changes

When updating modes, consider backward compatibility:
- Version your modes appropriately
- Maintain old API endpoints during transition
- Provide migration tools for existing jobs
- Document breaking changes clearly

## Performance Targets

- **API Response Time**: p95 < 500ms (non-processing endpoints)
- **Mode Processing**: Within estimated time per URL ±50%
- **Memory Usage**: <512MB per job
- **Error Rate**: <5% for valid URLs
- **Concurrency**: Respect site limits and robots.txt
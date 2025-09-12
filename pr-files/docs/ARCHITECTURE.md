# EdgeScraperPro Architecture

## Current State Analysis

### CLI Infrastructure
EdgeScraperPro currently has a robust CLI foundation with:

- **Multi-mode extraction support**: CLI already supports `--mode` parameter with three modes:
  - `supplier-directory`: Extracts company data from directory pages
  - `sports`: Extracts player statistics from Pro Football Reference and similar sites
  - `general`: Basic content extraction without specialized processing

- **Batch Processing**: Comprehensive `BatchProcessor` class with:
  - Concurrent processing with configurable limits
  - URL normalization and canonicalization
  - Pagination discovery
  - Structured logging with NDJSON format
  - Error taxonomy and categorization
  - Progress tracking and retry logic

- **HTTP Client**: Enhanced fetch client with:
  - Per-host rate limiting using token bucket algorithm
  - 429-aware retry logic with exponential backoff
  - Circuit breaker pattern
  - URL canonicalization (HTTP→HTTPS, www variants, trailing slashes)
  - Comprehensive metrics collection

### Existing Extractors
- **SupplierDirectoryExtractor**: Specialized for business directory sites
- **SportsContentExtractor**: Handles Pro Football Reference and similar sports sites
- **General extraction**: Basic content extraction fallback

### UI Infrastructure
- **Next.js foundation**: Already configured with React Query for state management
- **Target List Formatter**: Existing UI for CSV/Excel processing with mapping capabilities
- **Static assets**: Legacy HTML interface in `public/index.html` (to be deprecated)

### Data Pipeline
- **Structured logging**: NDJSON format with job tracking
- **Export capabilities**: JSON, CSV, Excel formats
- **Database integration**: Prisma ORM with PostgreSQL
- **Queue system**: Redis-based job processing

## Target Architecture

### Mode Registry System

The new architecture will introduce a **pluggable mode registry** that standardizes how extraction modes are defined, loaded, and executed:

```typescript
interface ModeContract {
  id: string;                    // Unique identifier (e.g., 'news-articles')
  label: string;                 // Human-readable name
  description?: string;          // Mode description
  inputSchema: ZodSchema;        // Input validation schema
  outputSchema: ZodSchema;       // Output validation schema
  uiHints: {                     // UI configuration hints
    inputType: 'urls' | 'file' | 'text';
    supportsBatch: boolean;
    supportsProgress: boolean;
    estimatedTimePerUrl?: number;
  };
  run(input: any, ctx: ModeContext): Promise<any>;  // Execution function
}
```

### Three First-Class Modes

1. **news-articles**: Article list processing
   - Input: List of article URLs
   - Output: Structured article metadata (title, byline, date, content)
   - UI: Bulk URL input with article-specific options

2. **sports**: Player/team statistics extraction  
   - Input: Pro Football Reference and similar URLs
   - Output: Player stats, biographical data, career summaries
   - UI: Sports-specific validation and export formats

3. **supplier-directory**: Company directory processing
   - Input: Directory page URLs  
   - Output: Company listings with contact information
   - UI: Directory-specific pagination discovery options

### UI Architecture

**Navigation Structure:**
```
/scrape/
├── index.tsx        # Mode selection dashboard
├── news.tsx         # News articles mode
├── sports.tsx       # Sports statistics mode
└── companies.tsx    # Supplier directory mode
```

**Shared Components:**
- `ModeLayout`: Common layout with navigation and progress tracking
- `JobRunner`: Universal job execution with real-time updates
- `ResultsViewer`: Tabular results with export capabilities
- `LogViewer`: Structured log display with filtering

### API Layer

**Endpoint Structure:**
```
/api/scrape/
├── start           # POST: Start new scraping job
├── status/[id]     # GET: Job status and progress
├── results/[id]    # GET: Job results
├── logs/[id]       # GET: Structured logs
└── download/[id]   # GET: Export artifacts (JSON/CSV)
```

**Job Orchestration:**
- Redis-based job queue for background processing
- NDJSON log files for detailed job tracking
- S3/file system storage for job artifacts
- Real-time progress updates via polling

### Data Flow

```
UI Input → Mode Registry → Batch Processor → HTTP Client → Extractors
    ↓
Job Queue → Background Worker → Structured Logger → Results Storage
    ↓
API Endpoints → UI Updates → Export Downloads
```

### Backward Compatibility

- **CLI Interface**: Existing `--mode` parameter maps directly to mode registry
- **Batch Processor**: Enhanced to work with mode registry while maintaining current API
- **HTTP Client**: No changes required - modes use existing infrastructure
- **Export System**: Extended to support mode-specific output formats

### Migration Strategy

1. **Phase 1**: Create mode registry and contracts
2. **Phase 2**: Migrate existing extractors to mode implementations  
3. **Phase 3**: Build Next.js UI pages with shared components
4. **Phase 4**: Implement API endpoints and job orchestration
5. **Phase 5**: Add comprehensive testing and error handling
6. **Phase 6**: Documentation and final integration

## Key Design Principles

1. **Modularity**: Each mode is self-contained with clear contracts
2. **Reusability**: Shared infrastructure for HTTP, logging, and processing
3. **Extensibility**: New modes can be added without core changes
4. **Observability**: Comprehensive logging and metrics at every layer
5. **Reliability**: Error handling, retries, and graceful degradation
6. **Performance**: Efficient batch processing with resource management

This architecture preserves all existing functionality while providing a clean, extensible foundation for future growth.
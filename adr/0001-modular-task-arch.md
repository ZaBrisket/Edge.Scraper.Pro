# ADR-0001: Modular Task Architecture with Tabbed UI

## Status
Proposed

## Context
The current Edge.Scraper.Pro codebase has three main scraping modes (News, Sports, Companies) implemented as separate classes in `/src/modes/`. While functional, this architecture has several limitations:

1. **Tight Coupling**: Each mode directly imports and uses shared utilities, making it difficult to add new tasks
2. **No Centralized API**: No unified interface for task execution and management
3. **UI Scattered**: Web interface is spread across multiple pages without a cohesive tabbed experience
4. **Hard to Extend**: Adding new scraping tasks requires changes across multiple files
5. **Limited Reusability**: Shared functionality is duplicated across modes

## Decision
Refactor the codebase into a modular task architecture with:

### Core Abstractions
- **TaskContext**: Shared context object providing http, storage, logger, rateLimiter, config
- **ScrapeTask Interface**: Standardized interface for all scraping tasks
- **Task Dispatcher**: Central registry and execution engine for all tasks

### Module Structure
```
/core/           # Shared utilities and abstractions
  - types.ts     # Core interfaces and types
  - http.ts      # HTTP client utilities
  - rateLimit.ts # Rate limiting logic
  - parsers.ts   # Common parsing utilities
  - storage.ts   # Storage abstractions
  - config.ts    # Configuration management
  - log.ts       # Logging utilities
  - errors.ts    # Error handling

/tasks/          # Individual task modules
  /news/         # News articles scraping
  /sports/       # Sports statistics scraping
  /companies/    # Company data scraping
  Each task module contains:
  - schema.ts    # Input/output schemas
  - task.ts      # Task implementation
  - index.ts     # Module exports
  - __tests__/   # Task-specific tests

/api/            # API layer
  - dispatcher.ts # Task registry and execution
  - controller.ts # HTTP request handling
  - models.ts     # Data models

/pages/          # Web UI
  /news          # News scraping page
  /sports        # Sports scraping page
  /companies     # Companies scraping page
```

### Task Interface
```typescript
export interface ScrapeTask<I, O> {
  name: string;
  input: z.ZodSchema<I>;
  output: z.ZodSchema<O>;
  run(payload: I, ctx: TaskContext): Promise<O>;
}
```

### Dispatcher Pattern
```typescript
const REG = new Map<string, ScrapeTask<any, any>>();
export const registerTask = (t: ScrapeTask<any, any>) => REG.set(t.name, t);
export const runTask = async (name: string, payload: any, ctx: TaskContext) => {
  const task = REG.get(name);
  if (!task) throw new Error(`Unknown task: ${name}`);
  const validatedInput = task.input.parse(payload);
  const result = await task.run(validatedInput, ctx);
  return task.output.parse(result);
};
```

## Consequences

### Positive
- **Modularity**: Each task is self-contained and can be developed independently
- **Extensibility**: Adding new tasks requires only creating a new task module
- **Testability**: Each task can be tested in isolation
- **Reusability**: Shared utilities are centralized and reusable
- **Maintainability**: Clear separation of concerns and standardized interfaces
- **UI Consistency**: Unified tabbed interface for all tasks

### Negative
- **Migration Effort**: Significant refactoring required
- **Learning Curve**: Developers need to understand the new architecture
- **Initial Complexity**: More files and abstractions to manage

### Risks
- **Breaking Changes**: Existing API endpoints may need updates
- **Performance**: Additional abstraction layers may introduce overhead
- **Testing**: Need comprehensive test coverage for all refactored components

## Migration Strategy

### Phase 1: Core Abstractions
1. Create `/core` directory with shared utilities
2. Implement `TaskContext` and `ScrapeTask` interfaces
3. Create task dispatcher with registry pattern

### Phase 2: Task Modules
1. Extract News mode to `/tasks/news`
2. Extract Sports mode to `/tasks/sports`
3. Extract Companies mode to `/tasks/companies`
4. Update all imports and dependencies

### Phase 3: API Layer
1. Create unified API endpoints using dispatcher
2. Maintain backward compatibility with legacy endpoints
3. Add deprecation warnings for old endpoints

### Phase 4: UI Refactoring
1. Create tabbed navigation component
2. Refactor existing pages to use new task modules
3. Add consistent form handling and result display

### Phase 5: Testing & Documentation
1. Add comprehensive test coverage
2. Update documentation
3. Create developer guide for adding new tasks

## Rollback Plan
If issues arise during migration:

1. **Immediate**: Revert to previous commit
2. **Partial**: Keep legacy endpoints working while fixing new architecture
3. **Gradual**: Migrate one task at a time with feature flags

## Success Criteria
- [ ] All three tasks (News, Sports, Companies) work through new architecture
- [ ] Adding a new task requires only creating a new task module
- [ ] All existing functionality is preserved
- [ ] Test coverage is maintained or improved
- [ ] Performance is not significantly degraded
- [ ] Documentation is updated

## Implementation Timeline
- **Week 1**: Core abstractions and dispatcher
- **Week 2**: Task module extraction
- **Week 3**: API layer and backward compatibility
- **Week 4**: UI refactoring and testing
- **Week 5**: Documentation and final testing

## References
- Current mode implementation in `/src/modes/`
- Existing API endpoints in `/pages/api/scrape/`
- Current web interface in `/pages/scrape/`
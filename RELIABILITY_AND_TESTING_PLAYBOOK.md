# Reliability & Testing Playbook

## Overview

This playbook provides comprehensive guidelines for building reliable, robust, and well-tested code in the Edge.Scraper.Pro project. It covers patterns, practices, and tools for ensuring high-quality, production-ready code.

## Table of Contents

1. [Reliability Patterns](#reliability-patterns)
2. [Testing Patterns](#testing-patterns)
3. [Error Handling Guidelines](#error-handling-guidelines)
4. [Resource Management](#resource-management)
5. [Performance Considerations](#performance-considerations)
6. [Monitoring and Observability](#monitoring-and-observability)
7. [CI/CD Pipeline](#cicd-pipeline)
8. [Code Review Checklist](#code-review-checklist)

## Reliability Patterns

### 1. Input Validation and Sanitization

**Always validate inputs at module boundaries:**

```javascript
const { z } = require('zod');

const URL_SCHEMA = z.string().url().min(1).max(2048);
const OPTIONS_SCHEMA = z.object({
  timeout: z.number().int().positive().max(300000).optional(),
  retries: z.number().int().min(0).max(10).optional(),
  headers: z.record(z.string()).optional()
}).strict();

function validateInput(input, options = {}) {
  try {
    const validatedUrl = URL_SCHEMA.parse(input);
    const validatedOptions = OPTIONS_SCHEMA.parse(options);
    return { url: validatedUrl, options: validatedOptions };
  } catch (error) {
    throw new ValidationError(`Input validation failed: ${error.message}`);
  }
}
```

**Key Principles:**
- Use schema validation libraries (Zod, Joi, etc.)
- Validate at module boundaries, not internally
- Provide clear, actionable error messages
- Sanitize inputs to prevent injection attacks
- Set reasonable limits on input sizes

### 2. Timeout Management

**Implement timeouts for all external operations:**

```javascript
async function withTimeout(promise, timeoutMs, operation = 'operation') {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

// Usage
const result = await withTimeout(
  fetchWithPolicy(url),
  config.READ_TIMEOUT_MS,
  'HTTP request'
);
```

**Key Principles:**
- Set timeouts for all external I/O operations
- Use different timeout values for different operations
- Provide context in timeout error messages
- Consider retry logic with exponential backoff

### 3. Circuit Breaker Pattern

**Implement circuit breakers for external services:**

```javascript
class CircuitBreaker {
  constructor(threshold = 5, resetTime = 30000) {
    this.threshold = threshold;
    this.resetTime = resetTime;
    this.state = 'closed';
    this.failures = 0;
    this.lastFailureTime = 0;
  }
  
  async execute(operation) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTime) {
        this.state = 'half-open';
      } else {
        throw new CircuitOpenError('Circuit breaker is open');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }
  
  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

**Key Principles:**
- Open circuit on consecutive failures
- Half-open state for testing recovery
- Different thresholds for different error types
- Exclude certain errors (like 429 rate limits) from circuit breaker

### 4. Retry Logic with Jitter

**Implement intelligent retry mechanisms:**

```javascript
function calculateBackoff(attempt, baseDelay = 1000, maxDelay = 30000, jitter = 0.1) {
  const exponentialDelay = Math.min(
    baseDelay * Math.pow(2, attempt - 1),
    maxDelay
  );
  
  const jitterAmount = Math.random() * exponentialDelay * jitter;
  return Math.floor(exponentialDelay + jitterAmount);
}

async function withRetries(operation, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries && isRetryableError(error)) {
        const delay = calculateBackoff(attempt, baseDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }
  
  throw lastError;
}
```

**Key Principles:**
- Use exponential backoff with jitter
- Only retry idempotent operations
- Different retry strategies for different error types
- Respect Retry-After headers when present

### 5. Resource Cleanup

**Always clean up resources properly:**

```javascript
class ResourceManager {
  constructor() {
    this.resources = new Set();
    this.cleanupCallbacks = new Set();
  }
  
  register(resource, cleanup) {
    this.resources.add(resource);
    this.cleanupCallbacks.add(cleanup);
  }
  
  async cleanup() {
    const cleanupPromises = Array.from(this.cleanupCallbacks).map(async (cleanup) => {
      try {
        await cleanup();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    });
    
    await Promise.all(cleanupPromises);
    this.resources.clear();
    this.cleanupCallbacks.clear();
  }
}
```

**Key Principles:**
- Register all resources for cleanup
- Use try-catch in cleanup functions
- Clean up on process exit
- Monitor for resource leaks

## Testing Patterns

### 1. Deterministic Testing

**Make tests deterministic and repeatable:**

```javascript
// Use fixed seeds for random operations
beforeEach(() => {
  Math.random = jest.fn(() => 0.5); // Fixed random value
});

// Use fake timers for time-dependent tests
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// Test with controlled delays
test('handles timeouts correctly', async () => {
  const processor = new BatchProcessor({ timeout: 1000 });
  
  jest.advanceTimersByTime(1000);
  
  await expect(processor.processBatch(urls, slowProcessor))
    .rejects.toThrow('Request timed out');
});
```

**Key Principles:**
- Use fixed random seeds
- Mock time-dependent operations
- Avoid real network calls in tests
- Use deterministic test data

### 2. Comprehensive Error Testing

**Test all error scenarios:**

```javascript
describe('Error Handling', () => {
  test('handles network errors', async () => {
    const processor = new BatchProcessor();
    const failingProcessor = createFailingProcessor('network');
    
    const result = await processor.processBatch(urls, failingProcessor);
    
    expect(result.stats.failedUrls).toBe(urls.length);
    expect(result.errorReport.errorsByCategory.network).toBeDefined();
  });
  
  test('handles timeout errors', async () => {
    const processor = new BatchProcessor({ timeout: 100 });
    const slowProcessor = createSlowProcessor(200);
    
    const result = await processor.processBatch(urls, slowProcessor);
    
    expect(result.stats.failedUrls).toBe(urls.length);
    expect(result.errorReport.errorsByCategory.timeout).toBeDefined();
  });
  
  test('handles validation errors', async () => {
    const processor = new BatchProcessor();
    
    await expect(processor.processBatch(['invalid-url'], mockProcessor))
      .rejects.toThrow('URL validation failed');
  });
});
```

**Key Principles:**
- Test all error paths
- Verify error categorization
- Test error recovery mechanisms
- Test error reporting

### 3. Integration Testing

**Test module interactions:**

```javascript
describe('Integration Tests', () => {
  test('HTTP client with batch processor', async () => {
    const httpClient = new HardenedHttpClient();
    const batchProcessor = new HardenedBatchProcessor();
    
    const processor = (url) => httpClient.fetchWithPolicy(url);
    const result = await batchProcessor.processBatch(urls, processor);
    
    expect(result.stats.successfulUrls).toBeGreaterThan(0);
    expect(result.metrics.performance.throughput).toBeGreaterThan(0);
  });
});
```

**Key Principles:**
- Test real module interactions
- Use realistic test data
- Test performance characteristics
- Test error propagation

### 4. Performance Testing

**Test performance characteristics:**

```javascript
describe('Performance Tests', () => {
  test('processes large batches efficiently', async () => {
    const processor = new BatchProcessor({ concurrency: 5 });
    const urls = generateTestUrls(1000);
    
    const start = Date.now();
    const result = await processor.processBatch(urls, mockProcessor);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    expect(result.metrics.performance.throughput).toBeGreaterThan(50); // At least 50 req/s
  });
});
```

**Key Principles:**
- Set performance benchmarks
- Test with realistic data sizes
- Monitor memory usage
- Test under load

## Error Handling Guidelines

### 1. Structured Error Types

**Use structured error types:**

```javascript
class HttpError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.code = code;
    this.meta = meta;
    this.name = this.constructor.name;
  }
}

class NetworkError extends HttpError {
  constructor(message = 'Network error', meta = {}) {
    super('NETWORK_ERROR', message, meta);
  }
}

class RateLimitError extends HttpError {
  constructor(message = 'Rate limited', meta = {}) {
    super('RATE_LIMIT', message, meta);
  }
}
```

**Key Principles:**
- Use consistent error hierarchy
- Include error codes for programmatic handling
- Provide context in error metadata
- Make errors serializable

### 2. Error Categorization

**Categorize errors for intelligent handling:**

```javascript
function categorizeError(error) {
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return { category: 'network', retryable: true };
  }
  
  if (error.status === 429) {
    return { category: 'rate_limit', retryable: true };
  }
  
  if (error.status >= 500) {
    return { category: 'server_error', retryable: true };
  }
  
  if (error.status >= 400) {
    return { category: 'client_error', retryable: false };
  }
  
  return { category: 'unknown', retryable: false };
}
```

**Key Principles:**
- Categorize errors by type and severity
- Determine retryability
- Provide actionable error information
- Log errors with appropriate levels

### 3. Error Recovery

**Implement intelligent error recovery:**

```javascript
async function processWithRecovery(operation, options = {}) {
  const { maxRetries = 3, backoffMs = 1000 } = options;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const { category, retryable } = categorizeError(error);
      
      if (!retryable || attempt === maxRetries) {
        throw error;
      }
      
      const delay = calculateBackoff(attempt, backoffMs);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

**Key Principles:**
- Only retry retryable errors
- Use appropriate backoff strategies
- Fail fast for non-retryable errors
- Log retry attempts

## Resource Management

### 1. Memory Management

**Monitor and manage memory usage:**

```javascript
class MemoryManager {
  constructor(thresholdMB = 100) {
    this.thresholdMB = thresholdMB;
    this.checkInterval = setInterval(() => this.checkMemory(), 5000);
  }
  
  checkMemory() {
    const memUsage = process.memoryUsage();
    const currentMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    if (currentMB > this.thresholdMB) {
      this.emit('memoryWarning', { currentMB, thresholdMB: this.thresholdMB });
      this.triggerGC();
    }
  }
  
  triggerGC() {
    if (global.gc) {
      global.gc();
    }
  }
}
```

**Key Principles:**
- Monitor memory usage regularly
- Set memory thresholds
- Trigger garbage collection when needed
- Clean up large objects promptly

### 2. Connection Pooling

**Manage connections efficiently:**

```javascript
class ConnectionPool {
  constructor(maxConnections = 10) {
    this.maxConnections = maxConnections;
    this.connections = new Set();
    this.waiting = [];
  }
  
  async acquire() {
    if (this.connections.size < this.maxConnections) {
      const connection = await this.createConnection();
      this.connections.add(connection);
      return connection;
    }
    
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }
  
  release(connection) {
    this.connections.delete(connection);
    
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift();
      resolve(this.acquire());
    }
  }
}
```

**Key Principles:**
- Limit concurrent connections
- Reuse connections when possible
- Queue requests when pool is full
- Clean up idle connections

## Performance Considerations

### 1. Concurrency Control

**Control concurrency to prevent resource exhaustion:**

```javascript
class ConcurrencyLimiter {
  constructor(maxConcurrent = 5) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }
  
  async execute(operation) {
    if (this.running < this.maxConcurrent) {
      this.running++;
      try {
        return await operation();
      } finally {
        this.running--;
        this.processQueue();
      }
    }
    
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
    });
  }
  
  processQueue() {
    if (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const { operation, resolve, reject } = this.queue.shift();
      this.execute(operation).then(resolve).catch(reject);
    }
  }
}
```

**Key Principles:**
- Limit concurrent operations
- Queue excess requests
- Monitor queue depth
- Provide backpressure

### 2. Caching

**Implement intelligent caching:**

```javascript
class Cache {
  constructor(ttl = 300000, maxSize = 1000) {
    this.ttl = ttl;
    this.maxSize = maxSize;
    this.cache = new Map();
    this.timers = new Map();
  }
  
  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    this.cache.set(key, { value, timestamp: Date.now() });
    
    const timer = setTimeout(() => {
      this.delete(key);
    }, this.ttl);
    
    this.timers.set(key, timer);
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.delete(key);
      return null;
    }
    
    return item.value;
  }
}
```

**Key Principles:**
- Use appropriate TTL values
- Implement LRU eviction
- Monitor cache hit rates
- Consider cache invalidation

## Monitoring and Observability

### 1. Metrics Collection

**Collect comprehensive metrics:**

```javascript
class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: { total: 0, successful: 0, failed: 0 },
      timing: { totalMs: 0, averageMs: 0, minMs: Infinity, maxMs: 0 },
      errors: { byCategory: {}, byType: {} },
      performance: { throughput: 0, efficiency: 0 }
    };
  }
  
  recordRequest(success, duration) {
    this.metrics.requests.total++;
    if (success) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }
    
    this.updateTiming(duration);
  }
  
  recordError(category, type) {
    this.metrics.errors.byCategory[category] = 
      (this.metrics.errors.byCategory[category] || 0) + 1;
    this.metrics.errors.byType[type] = 
      (this.metrics.errors.byType[type] || 0) + 1;
  }
}
```

**Key Principles:**
- Track key performance indicators
- Use consistent metric names
- Include metadata for filtering
- Export metrics for monitoring systems

### 2. Logging

**Implement structured logging:**

```javascript
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie'] }
});

// Usage
logger.info({ 
  url, 
  duration, 
  status: response.status 
}, 'Request completed');

logger.error({ 
  error: error.message, 
  stack: error.stack,
  context: { url, attempt }
}, 'Request failed');
```

**Key Principles:**
- Use structured logging (JSON)
- Include relevant context
- Redact sensitive information
- Use appropriate log levels

### 3. Health Checks

**Implement health check endpoints:**

```javascript
function getHealthStatus() {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.round(uptime),
    memory: {
      used: Math.round(memUsage.heapUsed / 1024 / 1024),
      total: Math.round(memUsage.heapTotal / 1024 / 1024)
    },
    metrics: getMetrics()
  };
}
```

**Key Principles:**
- Provide health status endpoint
- Include key system metrics
- Check dependencies
- Return appropriate HTTP status codes

## CI/CD Pipeline

### 1. Test Pipeline

**Comprehensive test pipeline:**

```yaml
name: Test Pipeline

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linting
      run: npm run lint
    
    - name: Run type checking
      run: npm run type-check
    
    - name: Run unit tests
      run: npm run test:unit
    
    - name: Run integration tests
      run: npm run test:integration
    
    - name: Run flakiness detection
      run: npm run test:flakiness
    
    - name: Generate coverage report
      run: npm run test:coverage
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
```

### 2. Flakiness Detection

**Detect and prevent flaky tests:**

```javascript
// test:flakiness script
const { spawn } = require('child_process');

async function runFlakinessDetection() {
  const testSuites = [
    'tests/http-client.test.js',
    'tests/batch-processor.test.js',
    'tests/sports-extractor.test.js'
  ];
  
  for (const suite of testSuites) {
    console.log(`Running flakiness detection for ${suite}...`);
    
    const results = [];
    for (let i = 0; i < 5; i++) {
      const result = await runTestSuite(suite);
      results.push(result);
    }
    
    const failures = results.filter(r => r.exitCode !== 0);
    if (failures.length > 0) {
      console.error(`Flaky tests detected in ${suite}: ${failures.length}/5 runs failed`);
      process.exit(1);
    }
  }
}
```

**Key Principles:**
- Run tests multiple times
- Detect inconsistent results
- Fail pipeline on flakiness
- Report flaky test patterns

### 3. Coverage Requirements

**Enforce coverage thresholds:**

```json
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      },
      "./src/lib/": {
        "branches": 85,
        "functions": 85,
        "lines": 85,
        "statements": 85
      }
    }
  }
}
```

**Key Principles:**
- Set coverage thresholds
- Require higher coverage for critical modules
- Fail pipeline on low coverage
- Track coverage trends

## Code Review Checklist

### 1. Reliability Checklist

- [ ] Input validation at module boundaries
- [ ] Timeout handling for external operations
- [ ] Error handling for all failure modes
- [ ] Resource cleanup in all code paths
- [ ] Circuit breaker for external services
- [ ] Retry logic with appropriate backoff
- [ ] Memory leak prevention
- [ ] Concurrency control
- [ ] Graceful shutdown handling

### 2. Testing Checklist

- [ ] Unit tests for all public methods
- [ ] Integration tests for module interactions
- [ ] Error scenario testing
- [ ] Performance testing
- [ ] Deterministic test behavior
- [ ] Test coverage meets requirements
- [ ] No flaky tests
- [ ] Mock external dependencies
- [ ] Test cleanup and teardown

### 3. Performance Checklist

- [ ] No unnecessary blocking operations
- [ ] Efficient data structures
- [ ] Appropriate caching
- [ ] Memory usage monitoring
- [ ] Connection pooling
- [ ] Batch processing where applicable
- [ ] Lazy loading when appropriate
- [ ] Performance benchmarks

### 4. Security Checklist

- [ ] Input sanitization
- [ ] No sensitive data in logs
- [ ] Secure error messages
- [ ] Rate limiting
- [ ] Authentication/authorization
- [ ] Data validation
- [ ] SQL injection prevention
- [ ] XSS prevention

## Conclusion

This playbook provides a comprehensive framework for building reliable, robust, and well-tested code. By following these patterns and practices, you can ensure that your code is production-ready and maintainable.

Remember:
- Reliability is not optional - it's a requirement
- Testing is not just about coverage - it's about confidence
- Performance matters - measure and optimize
- Security is everyone's responsibility
- Documentation is part of the code

For questions or suggestions about this playbook, please create an issue or submit a pull request.
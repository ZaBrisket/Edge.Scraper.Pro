# EdgeScraperPro Observability

## Overview

EdgeScraperPro provides comprehensive observability through structured logging, metrics collection, and job tracking. This document describes where logs live, how to read summaries, and how to monitor system health.

## Logging Architecture

### Structured Logging

All components use structured JSON logging with consistent fields:

```json
{
  "level": "info",
  "time": 1757689518254,
  "pid": 5055,
  "hostname": "cursor",
  "correlationId": "a7acfcd5-fdfd-458c-9b65-fea36d5087e3",
  "context": "mode-registry",
  "msg": "Mode registry initialized",
  "modeId": "news-articles",
  "jobId": "job-123",
  "urlCount": 50
}
```

### Log Levels

- **ERROR**: System errors, job failures, critical issues
- **WARN**: Recoverable errors, rate limits, validation warnings
- **INFO**: Job lifecycle, mode execution, API requests
- **DEBUG**: Detailed execution flow, performance metrics

### Log Locations

#### Development
```bash
# Console output (structured JSON)
npm run dev

# File logs (when enabled)
logs/
├── job-{jobId}.log          # NDJSON job logs
├── api-{date}.log           # API request logs
├── mode-{mode}-{date}.log   # Mode-specific logs
└── system-{date}.log        # System-level logs
```

#### Production
```bash
# Docker/Container logs
docker logs edge-scraper-pro

# Persistent storage
/var/log/edge-scraper/
├── jobs/
│   └── {jobId}.ndjson       # Individual job logs
├── api/
│   └── {date}.ndjson        # API access logs
└── system/
    └── {date}.ndjson        # System logs
```

## Job Tracking

### Job Lifecycle

Every scraping job goes through these states with full logging:

1. **PENDING** → Job created, input validated
2. **RUNNING** → Processing URLs, progress updates
3. **COMPLETED** → All URLs processed, results available
4. **FAILED** → Job failed, error details logged
5. **CANCELLED** → User cancelled, cleanup performed

### Job Logs Format

Each job creates an NDJSON log file with entries like:

```json
{"timestamp":"2025-09-12T15:30:00Z","jobId":"abc123","event":"job.started","mode":"news-articles","urlCount":25}
{"timestamp":"2025-09-12T15:30:01Z","jobId":"abc123","event":"url.processing","url":"https://example.com/article","attempt":1}
{"timestamp":"2025-09-12T15:30:02Z","jobId":"abc123","event":"url.success","url":"https://example.com/article","responseTime":1250,"dataExtracted":true}
{"timestamp":"2025-09-12T15:30:03Z","jobId":"abc123","event":"url.failed","url":"https://broken.com","error":"timeout","category":"network_error"}
{"timestamp":"2025-09-12T15:30:10Z","jobId":"abc123","event":"job.completed","duration":10000,"successful":24,"failed":1}
```

### Job Summary

Each completed job generates a summary with:

```json
{
  "jobId": "abc123",
  "mode": "news-articles",
  "status": "completed",
  "timing": {
    "startTime": "2025-09-12T15:30:00Z",
    "endTime": "2025-09-12T15:30:10Z",
    "duration": 10000
  },
  "urlStats": {
    "total": 25,
    "successful": 24,
    "failed": 1,
    "averageTime": 1200
  },
  "errorBreakdown": {
    "network_error": 1,
    "timeout": 0,
    "http_404": 0
  },
  "urlPreservation": {
    "sourceUrls": 25,
    "processedUrls": 25,
    "discoveredUrls": 0
  }
}
```

## Metrics Collection

### System Metrics

#### Mode Registry Statistics
```bash
GET /api/metrics/modes
```

```json
{
  "totalModes": 3,
  "enabledModes": 3,
  "disabledModes": 0,
  "totalUsage": 1547,
  "mostUsedMode": "supplier-directory",
  "modeUsage": {
    "news-articles": 623,
    "sports": 234,
    "supplier-directory": 690
  }
}
```

#### Job Metrics
```bash
GET /api/metrics/jobs
```

```json
{
  "totalJobs": 1547,
  "activeJobs": 3,
  "completedJobs": 1520,
  "failedJobs": 24,
  "averageJobDuration": 45000,
  "jobsLast24h": 156,
  "successRate": 98.4
}
```

#### Performance Metrics
```bash
GET /api/metrics/performance
```

```json
{
  "apiResponseTimes": {
    "p50": 245,
    "p95": 487,
    "p99": 892
  },
  "processingTimes": {
    "news-articles": 1450,
    "sports": 2890,
    "supplier-directory": 2100
  },
  "errorRates": {
    "last1h": 2.1,
    "last24h": 3.4,
    "last7d": 4.2
  }
}
```

## Monitoring Dashboards

### Real-time Job Monitoring

Access the job monitoring dashboard:
```
http://localhost:3000/admin/jobs
```

Features:
- Active job progress
- Recent job history
- Error rate trends
- Performance metrics
- Resource utilization

### Mode Performance Dashboard

Monitor mode-specific performance:
```
http://localhost:3000/admin/modes
```

Features:
- Usage statistics per mode
- Success rates by mode
- Average processing times
- Error categorization
- Resource consumption

## Alerting

### Error Rate Alerts

Set up alerts for high error rates:

```yaml
# Example alert configuration
alerts:
  - name: high_error_rate
    condition: error_rate_1h > 10%
    severity: warning
    notification: slack
    
  - name: job_failures
    condition: failed_jobs_1h > 5
    severity: critical
    notification: pagerduty
```

### Performance Alerts

Monitor performance degradation:

```yaml
alerts:
  - name: slow_api_response
    condition: api_p95_response_time > 1000ms
    severity: warning
    
  - name: job_timeout
    condition: avg_job_duration > 300s
    severity: critical
```

## Troubleshooting Guide

### Common Issues

#### High Error Rates

1. **Check error categories**:
   ```bash
   grep '"event":"url.failed"' logs/job-*.log | jq -r '.category' | sort | uniq -c
   ```

2. **Identify problematic URLs**:
   ```bash
   grep '"category":"http_404"' logs/job-*.log | jq -r '.url' | head -10
   ```

3. **Review rate limiting**:
   ```bash
   grep '"category":"rate_limit"' logs/job-*.log | jq -r '.url' | cut -d'/' -f3 | sort | uniq -c
   ```

#### Performance Issues

1. **Check processing times**:
   ```bash
   grep '"event":"url.success"' logs/job-*.log | jq '.responseTime' | sort -n | tail -10
   ```

2. **Identify slow modes**:
   ```bash
   grep '"event":"job.completed"' logs/job-*.log | jq -r '"\(.mode): \(.duration)"' | sort
   ```

3. **Monitor memory usage**:
   ```bash
   docker stats edge-scraper-pro
   ```

#### Job Failures

1. **Find failed jobs**:
   ```bash
   grep '"event":"job.failed"' logs/job-*.log | jq -r '"\(.jobId): \(.error)"'
   ```

2. **Check validation errors**:
   ```bash
   grep '"level":"error"' logs/api-*.log | grep validation | jq -r '.msg'
   ```

3. **Review timeout issues**:
   ```bash
   grep timeout logs/job-*.log | jq -r '"\(.url): \(.error)"'
   ```

## Log Analysis Tools

### Built-in Log Viewer

Access structured logs via the web interface:
```
http://localhost:3000/admin/logs?jobId=abc123
```

Features:
- Filter by job ID, level, or time range
- Search log messages
- Export filtered logs
- Real-time log streaming

### Command Line Tools

#### Job Summary
```bash
./tools/job-summary.sh abc123
```

#### Error Analysis
```bash
./tools/analyze-errors.sh --last-24h
```

#### Performance Report
```bash
./tools/performance-report.sh --mode news-articles --last-week
```

### Log Aggregation

#### ELK Stack Integration

Configure Elasticsearch, Logstash, and Kibana:

```yaml
# logstash.conf
input {
  file {
    path => "/var/log/edge-scraper/*.ndjson"
    start_position => "beginning"
    codec => "json"
  }
}

filter {
  if [correlationId] {
    mutate {
      add_field => { "trace_id" => "%{correlationId}" }
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "edge-scraper-%{+YYYY.MM.dd}"
  }
}
```

#### Grafana Dashboards

Import pre-built dashboards:
- Job success rates over time
- Error rate by category
- Processing time percentiles
- Resource utilization
- URL preservation metrics

## Best Practices

### Logging
- Use correlation IDs for request tracing
- Include relevant context in log messages
- Avoid logging sensitive information
- Use appropriate log levels
- Structure logs consistently

### Monitoring
- Set up proactive alerts
- Monitor both technical and business metrics
- Track user experience indicators
- Review logs regularly
- Maintain dashboard hygiene

### Performance
- Monitor resource usage trends
- Set up capacity planning alerts
- Track performance regressions
- Optimize slow operations
- Scale based on metrics

### Security
- Monitor for suspicious activity
- Log authentication events
- Track access patterns
- Alert on anomalies
- Audit log access

## Retention Policies

### Log Retention
- **Job logs**: 30 days (configurable)
- **API logs**: 14 days
- **System logs**: 7 days
- **Metrics**: 90 days (aggregated)

### Cleanup Scripts
```bash
# Clean old job logs
find logs/jobs/ -name "*.ndjson" -mtime +30 -delete

# Archive old API logs
find logs/api/ -name "*.ndjson" -mtime +14 -exec gzip {} \;

# Clean system logs
find logs/system/ -name "*.ndjson" -mtime +7 -delete
```

## Integration Examples

### Slack Notifications
```javascript
// Send job completion notification
if (job.status === 'completed') {
  await slack.send({
    text: `Job ${job.id} completed: ${job.stats.successful}/${job.stats.total} URLs processed`,
    channel: '#scraping-alerts'
  });
}
```

### Metrics Export
```javascript
// Export metrics to external system
const metrics = await getJobMetrics();
await prometheus.pushGateway(metrics);
```

### Custom Dashboards
```javascript
// Real-time job status API
app.get('/api/dashboard/status', (req, res) => {
  const activeJobs = getActiveJobs();
  const recentErrors = getRecentErrors();
  const systemHealth = getSystemHealth();
  
  res.json({ activeJobs, recentErrors, systemHealth });
});
```
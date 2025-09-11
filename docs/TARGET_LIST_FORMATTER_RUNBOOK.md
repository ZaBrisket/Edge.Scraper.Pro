# Target List Formatter - Operations Runbook

## Overview

The Target List Formatter is a production-grade system for processing target company lists with professional UTSS-style formatting. This runbook covers deployment, monitoring, troubleshooting, and maintenance procedures.

## Architecture Components

### Frontend (Next.js)
- **Location**: `/pages/targets/`, `/components/targets/`
- **Purpose**: User interface for upload, mapping, and preview
- **Dependencies**: React Query, React Hook Form, Zustand
- **Deployment**: Netlify static site

### API Layer (Netlify Functions)
- **Location**: `/netlify/functions/`
- **Purpose**: REST API endpoints for data processing
- **Dependencies**: Prisma, AWS SDK, Zod validation
- **Rate Limits**: 60 requests/minute per user

### Database (PostgreSQL)
- **Provider**: Neon (recommended) or self-hosted
- **Schema**: Managed via Prisma migrations
- **Backup**: Automated daily backups
- **Monitoring**: Connection pooling, query performance

### Queue System (Redis)
- **Provider**: Upstash Redis or self-hosted
- **Purpose**: Background job processing with retries
- **TTL**: Jobs expire after 24 hours
- **Monitoring**: Queue depth, processing times

### Storage (AWS S3)
- **Buckets**: Source files + generated artifacts
- **Security**: Presigned URLs, least-privilege IAM
- **Lifecycle**: Artifacts expire after 30 days
- **Monitoring**: Storage costs, request patterns

### Worker (Containerized)
- **Platform**: Fly.io, AWS Lambda, or Docker
- **Purpose**: Excel/PDF generation with ExcelJS/Playwright
- **Scaling**: Auto-scale based on queue depth
- **Monitoring**: Job success rates, processing times

## Deployment Guide

### Prerequisites

1. **Environment Setup**
```bash
# Required environment variables
DATABASE_URL="postgresql://user:pass@host:5432/db"
REDIS_URL="redis://user:pass@host:6379"
S3_REGION="us-east-1"
S3_BUCKET="your-bucket-name"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
APP_BASE_URL="https://yourdomain.com"
```

2. **Infrastructure Provisioning**
```bash
# Database (Neon)
npx neon-cli create-database edge-scraper-pro

# Redis (Upstash)
upstash redis create edge-scraper-queue

# S3 Bucket
aws s3 mb s3://your-bucket-name
aws s3api put-bucket-versioning --bucket your-bucket-name --versioning-configuration Status=Enabled
```

### Database Deployment

```bash
# 1. Install dependencies
npm ci

# 2. Generate Prisma client
npm run db:generate

# 3. Run migrations (production)
npx prisma migrate deploy

# 4. Seed default templates
npm run db:seed
```

### Web Application Deployment

```bash
# 1. Build Next.js application
npm run next:build

# 2. Deploy to Netlify
netlify deploy --prod --dir=out

# 3. Configure environment variables in Netlify UI
# - DATABASE_URL
# - REDIS_URL  
# - AWS credentials
# - S3_BUCKET
```

### Worker Deployment

#### Option A: Fly.io
```bash
# 1. Create fly.toml
cat > fly.toml << EOF
app = "export-worker"
primary_region = "iad"

[build]
  dockerfile = "worker/Dockerfile"

[[services]]
  internal_port = 3000
  protocol = "tcp"

[env]
  NODE_ENV = "production"
EOF

# 2. Deploy
fly deploy
```

#### Option B: AWS Lambda
```bash
# 1. Package worker
cd worker && npm ci --production
zip -r worker.zip .

# 2. Create Lambda function
aws lambda create-function \
  --function-name export-worker \
  --runtime nodejs18.x \
  --role arn:aws:iam::ACCOUNT:role/lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://worker.zip

# 3. Configure environment variables
aws lambda update-function-configuration \
  --function-name export-worker \
  --environment Variables="{DATABASE_URL=$DATABASE_URL,REDIS_URL=$REDIS_URL}"
```

## Monitoring & Alerting

### Key Metrics

1. **API Performance**
   - Response time p95 < 500ms
   - Error rate < 1%
   - Throughput: requests/minute

2. **Export Processing**
   - Job completion time < 30s for 10k rows
   - Success rate > 99%
   - Queue depth < 100 jobs

3. **System Health**
   - Database connection pool utilization
   - Redis memory usage
   - S3 request costs
   - Worker CPU/memory usage

### Monitoring Setup

```bash
# 1. Application monitoring (recommended: Sentry)
npm install @sentry/nextjs
# Configure in next.config.js and API functions

# 2. Infrastructure monitoring
# - Neon: Built-in dashboard
# - Upstash: Redis metrics dashboard  
# - AWS: CloudWatch for S3/Lambda
# - Fly.io: Built-in metrics

# 3. Custom alerts
# Set up alerts for:
# - API error rate > 5%
# - Export job failure rate > 5%
# - Queue depth > 1000
# - Database connection errors
```

### Log Analysis

```bash
# View Netlify function logs
netlify logs --live

# Worker logs (Fly.io)
fly logs

# Database slow queries
# Check Neon dashboard or pg_stat_statements

# Queue monitoring
redis-cli -u $REDIS_URL
> ZCARD export-jobs
> ZCARD export-jobs:processing
```

## Troubleshooting Guide

### Common Issues

#### 1. Upload Failures

**Symptoms**: Users can't upload files, presign requests fail
```bash
# Check S3 permissions
aws s3api head-bucket --bucket $S3_BUCKET

# Verify IAM policy
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::ACCOUNT:user/edge-scraper \
  --action-names s3:PutObject \
  --resource-arns arn:aws:s3:::$S3_BUCKET/*

# Check Netlify function logs
netlify logs --filter=uploads-presign
```

**Resolution**:
- Verify AWS credentials in Netlify environment
- Check S3 bucket CORS configuration
- Ensure bucket exists and is accessible

#### 2. Export Job Failures

**Symptoms**: Jobs stuck in "processing" or failing repeatedly
```bash
# Check worker health
curl -f http://worker-url/health || echo "Worker down"

# Inspect failed jobs
npx prisma studio
# Navigate to Job table, filter by status="failed"

# Check Redis queue
redis-cli -u $REDIS_URL ZRANGE export-jobs:processing 0 -1
```

**Resolution**:
- Restart worker if unresponsive
- Check worker logs for specific errors
- Verify database connectivity from worker
- Clear stuck jobs: `redis-cli -u $REDIS_URL DEL export-jobs:processing`

#### 3. Database Connection Issues

**Symptoms**: API timeouts, connection pool exhausted
```bash
# Check active connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# View connection pool status
# Check Prisma metrics or Neon dashboard

# Test connection
npx prisma db pull
```

**Resolution**:
- Increase connection pool size in Prisma schema
- Implement connection pooling (PgBouncer)
- Check for connection leaks in functions
- Scale database if needed

#### 4. Auto-Mapping Accuracy Issues

**Symptoms**: Poor mapping confidence scores, user complaints
```bash
# Check mapping templates
npx prisma studio
# Review MappingTemplate and FieldDef tables

# Analyze failed mappings
grep "low confidence" netlify-logs.txt

# Test with sample data
curl -X POST $APP_BASE_URL/api/preview \
  -H "Content-Type: application/json" \
  -d '{"datasetId":"test","templateId":"sourcescrub"}'
```

**Resolution**:
- Update template synonyms based on user feedback
- Add new header variations to FieldDef.sourceHeaders
- Implement fuzzy matching improvements
- Create custom templates for specific data sources

### Emergency Procedures

#### 1. Complete System Outage

```bash
# 1. Check external dependencies
curl -f https://api.neon.tech/v2/projects
curl -f https://api.upstash.com/v2/redis/databases

# 2. Verify Netlify deployment
netlify status

# 3. Emergency rollback
netlify rollback

# 4. Database emergency access
psql $DATABASE_URL
```

#### 2. Data Corruption

```bash
# 1. Stop all workers immediately
fly scale count 0

# 2. Create database backup
pg_dump $DATABASE_URL > emergency_backup.sql

# 3. Assess corruption scope
psql $DATABASE_URL -c "SELECT COUNT(*) FROM datasets WHERE created_at > '2024-01-01';"

# 4. Restore from backup if needed
# Use Neon point-in-time recovery or restore from backup
```

#### 3. Security Incident

```bash
# 1. Rotate all credentials immediately
aws iam create-access-key --user-name edge-scraper
# Update Netlify environment variables

# 2. Audit access logs
aws s3api get-bucket-logging --bucket $S3_BUCKET
# Check CloudTrail for suspicious activity

# 3. Review uploaded files
psql $DATABASE_URL -c "SELECT * FROM uploads WHERE created_at > '2024-01-01' ORDER BY created_at DESC;"

# 4. Implement additional security measures
# - Enable MFA on AWS account
# - Review IAM policies for least privilege
# - Enable S3 access logging
```

## Maintenance Procedures

### Daily Tasks

```bash
# 1. Check system health
curl -f $APP_BASE_URL/api/health

# 2. Monitor queue depth
redis-cli -u $REDIS_URL ZCARD export-jobs

# 3. Review error logs
grep ERROR netlify-logs.txt | tail -20

# 4. Check storage usage
aws s3api list-objects-v2 --bucket $S3_BUCKET --query 'Contents[?LastModified>`date -d "1 day ago" +%Y-%m-%d`]' | jq length
```

### Weekly Tasks

```bash
# 1. Database maintenance
psql $DATABASE_URL -c "VACUUM ANALYZE;"

# 2. Clean up old artifacts
psql $DATABASE_URL -c "DELETE FROM artifacts WHERE created_at < NOW() - INTERVAL '30 days';"

# 3. Review performance metrics
# Check Neon/Upstash dashboards for trends

# 4. Update dependencies
npm audit
npm update
```

### Monthly Tasks

```bash
# 1. Review and update mapping templates
# Based on user feedback and new data sources

# 2. Analyze usage patterns
psql $DATABASE_URL -c "
SELECT 
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as jobs,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration
FROM jobs 
WHERE status = 'completed'
GROUP BY month
ORDER BY month DESC;
"

# 3. Security audit
# - Review IAM policies
# - Check for unused access keys  
# - Update dependencies with security patches

# 4. Capacity planning
# - Database storage growth
# - S3 costs and usage
# - Worker scaling patterns
```

## Performance Tuning

### Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX CONCURRENTLY idx_jobs_user_status ON jobs(user_id, status);
CREATE INDEX CONCURRENTLY idx_datasets_user_created ON datasets(user_id, created_at);
CREATE INDEX CONCURRENTLY idx_artifacts_job_created ON artifacts(job_id, created_at);

-- Analyze query performance
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM jobs WHERE user_id = 'user123' AND status = 'completed';
```

### Redis Optimization

```bash
# Monitor memory usage
redis-cli -u $REDIS_URL INFO memory

# Optimize queue performance
redis-cli -u $REDIS_URL CONFIG SET maxmemory-policy allkeys-lru

# Clean up expired jobs
redis-cli -u $REDIS_URL EVAL "
local expired = redis.call('ZRANGEBYSCORE', 'export-jobs', 0, ARGV[1])
for i=1,#expired do
  redis.call('ZREM', 'export-jobs', expired[i])
end
return #expired
" 0 $(date -d '1 day ago' +%s)
```

### Worker Scaling

```bash
# Monitor worker performance
fly metrics --app export-worker

# Scale based on queue depth
queue_depth=$(redis-cli -u $REDIS_URL ZCARD export-jobs)
if [ $queue_depth -gt 100 ]; then
  fly scale count 3
elif [ $queue_depth -lt 10 ]; then
  fly scale count 1
fi
```

## Disaster Recovery

### Backup Strategy

1. **Database**: Automated daily backups via Neon
2. **Configuration**: Store in version control
3. **Artifacts**: S3 versioning enabled
4. **Code**: Git repository with tags

### Recovery Procedures

```bash
# 1. Database recovery
# Use Neon point-in-time recovery to specific timestamp
neon-cli restore --project-id PROJECT_ID --timestamp 2024-01-01T12:00:00Z

# 2. Application recovery
git checkout v1.0.0
npm ci
npm run db:generate
netlify deploy --prod

# 3. Worker recovery
fly deploy --dockerfile worker/Dockerfile

# 4. Data validation
npm run test:integration
```

### RTO/RPO Targets

- **Recovery Time Objective (RTO)**: 4 hours
- **Recovery Point Objective (RPO)**: 1 hour
- **Data Loss**: < 0.1% of daily transactions

## Support Contacts

- **Database Issues**: Neon support, PostgreSQL DBA
- **Infrastructure**: AWS support, Netlify support
- **Application**: Development team, on-call engineer
- **Security**: Security team, incident response

## Change Management

### Deployment Process

1. **Development**: Feature branch + PR review
2. **Staging**: Deploy to staging environment
3. **Testing**: Run full test suite + manual QA
4. **Production**: Blue-green deployment with rollback plan
5. **Monitoring**: Watch metrics for 24 hours post-deploy

### Rollback Procedures

```bash
# 1. Web application rollback
netlify rollback

# 2. Database rollback (if needed)
npx prisma migrate reset --force
npx prisma migrate deploy

# 3. Worker rollback
fly deploy --image previous-image-tag

# 4. Verify system health
curl -f $APP_BASE_URL/api/health
```

This runbook should be reviewed quarterly and updated based on operational experience and system changes.
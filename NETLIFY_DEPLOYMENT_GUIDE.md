# Netlify Deployment Guide

This guide explains how to fix the "Backend verification failed: Backend returned 401" error and properly deploy the application to Netlify.

## Issues Identified and Fixed

### 1. Import Path Issues
**Problem**: Netlify functions were importing from TypeScript source files instead of compiled JavaScript.
**Solution**: Updated all import paths from `../../src/lib/*` to `../../dist/lib/*`.

### 2. Missing Environment Variables
**Problem**: Required environment variables were not configured in Netlify.
**Solution**: Added comprehensive environment variable documentation and validation.

### 3. Build Configuration
**Problem**: Build process wasn't generating all required files.
**Solution**: Updated `netlify.toml` build command.

## Required Environment Variables

Set these environment variables in your Netlify dashboard (Site settings → Environment variables):

### Required
```
DATABASE_URL=postgresql://username:password@host:port/database
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

### Optional but Recommended
```
JWT_EXPIRES_IN=24h
ALLOWED_ORIGINS=https://your-domain.netlify.app,http://localhost:3000
NODE_ENV=production
```

### For File Upload Features
```
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
S3_BUCKET=your-s3-bucket
```

### For Redis Features
```
REDIS_URL=redis://username:password@host:port
```

## Deployment Steps

1. **Set Environment Variables**
   - Go to your Netlify dashboard
   - Navigate to Site settings → Environment variables
   - Add all required environment variables listed above

2. **Database Setup**
   - Ensure your PostgreSQL database is accessible from Netlify
   - Run database migrations: `npx prisma migrate deploy`
   - Generate Prisma client: `npx prisma generate`

3. **Deploy**
   - Push changes to your connected Git repository
   - Netlify will automatically trigger a new build
   - The build command will run: `npm run build && npm run db:generate`

4. **Verify Deployment**
   - Check the health endpoint: `https://your-site.netlify.app/api/health`
   - This will show environment status and dependency health

## Troubleshooting

### 401 Authentication Errors
- Check that `JWT_SECRET` is set in Netlify environment variables
- Verify `DATABASE_URL` is correctly configured
- Check function logs in Netlify dashboard

### Import/Dependency Errors
- Ensure the build completed successfully
- Check that all TypeScript files compiled to `dist/` directory
- Verify Netlify function logs for specific error messages

### Database Connection Issues
- Verify `DATABASE_URL` format and credentials
- Ensure database is accessible from Netlify's servers
- Check that database migrations are up to date

## Health Check Endpoint

Use the health check endpoint to diagnose issues:

```
GET /api/health
```

This endpoint will return:
- Environment variable status
- Dependency loading status
- Database connectivity status
- Overall system health

## Common Issues and Solutions

### "Module not found" errors
- Ensure TypeScript build completed successfully
- Check that import paths use `dist/` directory
- Verify all dependencies are installed

### "JWT_SECRET not found"
- Add `JWT_SECRET` to Netlify environment variables
- Use a strong, random secret (at least 32 characters)

### Database connection timeouts
- Check `DATABASE_URL` format
- Ensure database accepts external connections
- Consider using a hosted database service (Neon, Supabase, etc.)

## File Structure After Build

```
/
├── dist/                    # Compiled TypeScript
│   └── lib/
│       ├── auth/
│       ├── validation/
│       └── middleware/
├── netlify/
│   └── functions/          # Netlify serverless functions
├── prisma/                 # Database schema and migrations
└── netlify.toml           # Netlify configuration
```

## Security Notes

- Always use strong, unique secrets for `JWT_SECRET`
- Restrict `ALLOWED_ORIGINS` to your actual domains
- Use environment-specific database URLs
- Regularly rotate API keys and secrets
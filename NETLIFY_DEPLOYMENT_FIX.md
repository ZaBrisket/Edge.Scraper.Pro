# Netlify Deployment Fix for 401 Authentication Error

## Problem
The "Backend verification failed: Backend returned 401" error was caused by Netlify functions trying to import TypeScript files directly instead of the compiled JavaScript files.

## Solution Applied
1. Updated all Netlify function imports from `../../src/lib/*` to `../../dist/lib/*`
2. This ensures the functions use the compiled JavaScript files instead of TypeScript source files

## Required Netlify Configuration

### Environment Variables
You need to set these environment variables in your Netlify dashboard:

1. **JWT_SECRET** (Required)
   - A secure random string for signing JWT tokens
   - Example: Use a generator to create a 64+ character random string
   - **IMPORTANT**: Do NOT use the default value in production

2. **ALLOWED_ORIGINS** (Optional)
   - Comma-separated list of allowed origins for CORS
   - Default: `http://localhost:3000`
   - For production: Set to your actual domain(s), e.g., `https://yourdomain.com`

### Build Configuration
Ensure your Netlify build command includes TypeScript compilation:
```
npm run build
```

This should compile TypeScript files to the `dist/` directory before deploying.

### Verify Deployment
After deploying with these changes:
1. Check that the `dist/lib/auth` directory exists in your deployment
2. Verify environment variables are set in Netlify dashboard
3. Test the authentication endpoints:
   - `/api/auth/login`
   - `/api/auth/register`
   - `/api/auth/verify`

## Files Modified
- `/netlify/functions/auth-verify.js`
- `/netlify/functions/auth-login.js`
- `/netlify/functions/auth-register.js`
- `/netlify/functions/fetch-url.js`
- `/netlify/functions/uploads-presign.js`
- All other Netlify functions that import from `src/lib`

## Next Steps
1. Commit these changes to your repository
2. Push to trigger a new Netlify deployment
3. Set the required environment variables in Netlify dashboard
4. Test the authentication flow after deployment
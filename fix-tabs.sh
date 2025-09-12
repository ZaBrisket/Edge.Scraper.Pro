#!/bin/bash

# EdgeScraperPro Tab Navigation Fix Script
# This script fixes the deployment configuration to enable Next.js tabs

echo "🔧 EdgeScraperPro Tab Navigation Fix Script"
echo "==========================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the repository root."
    exit 1
fi

echo "✅ Repository detected"

# Backup existing files
echo "📦 Creating backups..."
[ -f "netlify.toml" ] && cp netlify.toml netlify.toml.backup
[ -f "next.config.js" ] && cp next.config.js next.config.js.backup
[ -f "pages/index.tsx" ] && cp pages/index.tsx pages/index.tsx.backup

# Create the main index page if it doesn't exist
echo "📝 Creating main index page..."
cat > pages/index.tsx << 'EOF'
/**
 * Main Landing Page
 * Redirects to the scrape section where the tabs are located
 */

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the scrape section with tabs
    router.replace('/scrape/news');
  }, [router]);

  return (
    <Layout title="EdgeScraperPro">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            EdgeScraperPro - Advanced Web Scraping Platform
          </h2>
          <p className="text-gray-600 mb-4">
            Loading scraping interface...
          </p>
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
        </div>
      </div>
    </Layout>
  );
}
EOF

# Update next.config.js for static export
echo "⚙️ Updating Next.js configuration..."
cat > next.config.js << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable static export for Netlify deployment
  output: 'export',
  // Disable image optimization for static export
  images: {
    unoptimized: true
  },
  // Ensure trailing slashes for better compatibility
  trailingSlash: true,
  // Environment variables available to the browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.API_URL || '/.netlify/functions',
  },
  // Custom webpack configuration if needed
  webpack: (config, { isServer }) => {
    // Fixes for serverless functions
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
EOF

# Update netlify.toml for Next.js deployment
echo "🚀 Updating Netlify configuration..."
cat > netlify.toml << 'EOF'
[build]
  # Changed from "public" to "out" for Next.js static export
  publish = "out"
  functions = "netlify/functions"
  # Changed from "npm run build" to build Next.js application
  command = "npm run next:build && npm run next:export"

[build.environment]
  NODE_VERSION = "18"
  NPM_FLAGS = "--production=false"

[functions]
  node_bundler = "esbuild"
  included_files = ["prisma/**/*"]

# Proxy API routes to Netlify Functions
[[redirects]]
  from = "/api/fetch-url"
  to = "/.netlify/functions/fetch-url"
  status = 200

[[redirects]]
  from = "/api/get-schema"
  to = "/.netlify/functions/get-schema"
  status = 200

# Authentication API Routes
[[redirects]]
  from = "/api/auth/login"
  to = "/.netlify/functions/auth-login"
  status = 200

[[redirects]]
  from = "/api/auth/register"
  to = "/.netlify/functions/auth-register"
  status = 200

[[redirects]]
  from = "/api/auth/verify"
  to = "/.netlify/functions/auth-verify"
  status = 200

# Target List Formatter API Routes
[[redirects]]
  from = "/api/uploads/presign"
  to = "/.netlify/functions/uploads-presign"
  status = 200

[[redirects]]
  from = "/api/uploads/commit"
  to = "/.netlify/functions/uploads-commit"
  status = 200

[[redirects]]
  from = "/api/templates"
  to = "/.netlify/functions/templates"
  status = 200

[[redirects]]
  from = "/api/preview"
  to = "/.netlify/functions/preview"
  status = 200

[[redirects]]
  from = "/api/health"
  to = "/.netlify/functions/health"
  status = 200

[[redirects]]
  from = "/api/jobs/export"
  to = "/.netlify/functions/jobs-export"
  status = 200

[[redirects]]
  from = "/api/jobs/*"
  to = "/.netlify/functions/jobs-status"
  status = 200

[[redirects]]
  from = "/api/artifacts/*/signed-url"
  to = "/.netlify/functions/artifacts-download"
  status = 200

# API Routes for Next.js application
[[redirects]]
  from = "/api/scrape/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[redirects]]
  from = "/api/tasks/*"
  to = "/.netlify/functions/:splat"
  status = 200
EOF

echo "✅ Configuration files updated"

# Test the build locally
echo ""
echo "🧪 Testing build locally..."
npm run next:build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Review the changes: git diff"
    echo "2. Commit the changes: git add -A && git commit -m 'Fix: Enable Next.js deployment with tab navigation'"
    echo "3. Push to deploy: git push origin main"
    echo "4. Wait 2-3 minutes for Netlify to rebuild"
    echo "5. Visit https://edgescraperpro.com/ to see the tabs!"
else
    echo "❌ Build failed. Restoring backups..."
    [ -f "netlify.toml.backup" ] && mv netlify.toml.backup netlify.toml
    [ -f "next.config.js.backup" ] && mv next.config.js.backup next.config.js
    [ -f "pages/index.tsx.backup" ] && mv pages/index.tsx.backup pages/index.tsx
    echo "Please check the error messages above and fix any issues."
    exit 1
fi

echo ""
echo "🎉 Script completed successfully!"

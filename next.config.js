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
  // Disable ESLint during build to avoid deployment failures
  eslint: {
    ignoreDuringBuilds: true,
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

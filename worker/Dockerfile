# Export Worker Dockerfile
FROM node:18-alpine

# Install system dependencies for Playwright
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Playwright to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY worker/package*.json ./worker/

# Install dependencies
RUN npm ci --only=production
RUN cd worker && npm ci --only=production

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Set working directory to worker
WORKDIR /app/worker

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)"

# Run the worker
CMD ["node", "dist/index.js"]
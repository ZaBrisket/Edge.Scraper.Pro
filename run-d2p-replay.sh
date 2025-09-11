#!/bin/bash
# One-click D2P Buyers Guide Replay Script
# 
# This script runs the D2P replay test with the enhanced URL normalization
# and pagination discovery features.

echo "🚀 D2P Buyers Guide Replay Test"
echo "================================"
echo ""

# Default options (can be overridden with command line args)
CONCURRENCY=${1:-2}
MAX_URLS=${2:-10}
RATE_LIMIT=${3:-1}

echo "Configuration:"
echo "  - Concurrency: $CONCURRENCY"
echo "  - Max URLs: $MAX_URLS" 
echo "  - Rate Limit: $RATE_LIMIT RPS"
echo ""

# Run the replay script
node tools/d2p-replay-script.js \
  --concurrency $CONCURRENCY \
  --maxUrls $MAX_URLS \
  --rateLimitRPS $RATE_LIMIT \
  --enableNormalization true \
  --enablePaginationDiscovery true \
  --enableStructuredLogging true \
  --timeout 15000

echo ""
echo "✅ Replay test completed!"
echo "📂 Check results in: ./d2p-replay-results/"
echo ""
echo "To run with different settings:"
echo "  ./run-d2p-replay.sh [concurrency] [max_urls] [rate_limit_rps]"
echo ""
echo "Example:"
echo "  ./run-d2p-replay.sh 1 5 0.5  # Conservative: 1 concurrent, 5 URLs, 0.5 RPS"
echo "  ./run-d2p-replay.sh 3 20 2   # Aggressive: 3 concurrent, 20 URLs, 2 RPS"
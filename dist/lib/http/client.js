"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWithPolicy = fetchWithPolicy;
const bottleneck_1 = __importDefault(require("bottleneck"));
const crypto_1 = require("crypto");
const errors_1 = require("./errors");
const config_1 = __importDefault(require("../config"));
const logger_1 = require("../logger");
// TTL cleanup for memory management
const LIMITER_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CIRCUIT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const limiters = new Map();
const circuits = new Map();
// Track creation times for TTL cleanup
const limiterTimestamps = new Map();
const circuitTimestamps = new Map();
// Start cleanup interval
let cleanupInterval = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
function cleanupExpiredEntries() {
    const now = Date.now();
    const logger = (0, logger_1.createLogger)('client-cleanup');
    // Clean up expired limiters
    for (const [host, timestamp] of limiterTimestamps.entries()) {
        if (now - timestamp > LIMITER_TTL_MS) {
            const limiter = limiters.get(host);
            if (limiter) {
                // Stop the limiter before removing
                limiter.stop({ dropWaitingJobs: true });
                limiters.delete(host);
                limiterTimestamps.delete(host);
                logger.info(`Cleaned up expired limiter for host: ${host}`, { host });
            }
        }
    }
    // Clean up expired circuits
    for (const [host, timestamp] of circuitTimestamps.entries()) {
        if (now - timestamp > CIRCUIT_TTL_MS) {
            circuits.delete(host);
            circuitTimestamps.delete(host);
            logger.info(`Cleaned up expired circuit for host: ${host}`, { host });
        }
    }
}
// Graceful shutdown cleanup
process.on('SIGINT', () => {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
    }
    // Clean up all limiters
    for (const [host, limiter] of limiters.entries()) {
        limiter.stop({ dropWaitingJobs: true });
    }
    limiters.clear();
    circuits.clear();
    limiterTimestamps.clear();
    circuitTimestamps.clear();
});
function getLimiter(host) {
    if (!limiters.has(host)) {
        const limiter = new bottleneck_1.default({
            maxConcurrent: config_1.default.MAX_CONCURRENCY,
            reservoir: config_1.default.RATE_LIMIT_PER_SEC,
            reservoirRefreshAmount: config_1.default.RATE_LIMIT_PER_SEC,
            reservoirRefreshInterval: 1000,
        });
        limiters.set(host, limiter);
        limiterTimestamps.set(host, Date.now());
    }
    else {
        // Update timestamp on access to extend TTL
        limiterTimestamps.set(host, Date.now());
    }
    return limiters.get(host);
}
function getCircuit(host) {
    if (!circuits.has(host)) {
        circuits.set(host, {
            state: 'closed',
            failures: 0,
            openedAt: 0,
        });
        circuitTimestamps.set(host, Date.now());
    }
    else {
        // Update timestamp on access to extend TTL
        circuitTimestamps.set(host, Date.now());
    }
    return circuits.get(host);
}
async function fetchWithPolicy(input, opts = {}) {
    const url = typeof input === 'string' ? new URL(input) : new URL(input.url || input.href);
    const host = url.host;
    const limiter = getLimiter(host);
    const circuit = getCircuit(host);
    const correlationId = opts.correlationId || (0, crypto_1.randomUUID)();
    const logger = (0, logger_1.createLogger)('http-client', correlationId).child({ host, url: url.toString() });
    if (circuit.state === 'open') {
        if (Date.now() - circuit.openedAt > config_1.default.CIRCUIT_BREAKER_RESET_MS) {
            circuit.state = 'half-open';
        }
        else {
            throw new errors_1.CircuitOpenError(`Circuit for ${host} is open`, { host });
        }
    }
    const maxRetries = opts.retries ?? config_1.default.MAX_RETRIES;
    const timeout = opts.timeout ?? config_1.default.DEFAULT_TIMEOUT_MS;
    const attemptFetch = async (attempt) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const headers = { ...(opts.headers || {}), 'x-correlation-id': correlationId };
        try {
            logger.info('outbound request', { attempt });
            const res = await fetch(url.toString(), { ...opts, headers, signal: controller.signal });
            if (res.status === 429) {
                throw new errors_1.RateLimitError('Upstream 429', { status: res.status });
            }
            if (res.status >= 500) {
                throw new errors_1.NetworkError(`Upstream ${res.status}`, { status: res.status });
            }
            // Success
            circuit.failures = 0;
            circuit.state = 'closed';
            return res;
        }
        catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                circuit.failures++;
                if (circuit.failures >= config_1.default.CIRCUIT_BREAKER_THRESHOLD) {
                    circuit.state = 'open';
                    circuit.openedAt = Date.now();
                }
                throw new errors_1.TimeoutError('Request timed out', { timeout });
            }
            if (err instanceof errors_1.RateLimitError || err instanceof errors_1.NetworkError) {
                circuit.failures++;
                if (circuit.failures >= config_1.default.CIRCUIT_BREAKER_THRESHOLD) {
                    circuit.state = 'open';
                    circuit.openedAt = Date.now();
                }
                throw err;
            }
            throw new errors_1.NetworkError(err instanceof Error ? err.message : 'Unknown error', { cause: err });
        }
        finally {
            clearTimeout(timer);
        }
    };
    let attempt = 0;
    while (true) {
        try {
            return await limiter.schedule(() => attemptFetch(attempt + 1));
        }
        catch (err) {
            if (err instanceof errors_1.CircuitOpenError || err instanceof errors_1.TimeoutError || attempt >= maxRetries) {
                throw err;
            }
            attempt++;
            const backoff = Math.min(100 * 2 ** attempt, 1000);
            const jitter = Math.floor(Math.random() * 100);
            await new Promise(r => setTimeout(r, backoff + jitter));
        }
    }
}
//# sourceMappingURL=client.js.map
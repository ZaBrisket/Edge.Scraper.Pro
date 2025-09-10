const EventEmitter = require('events');

class HttpMetrics extends EventEmitter {
  constructor() {
    super();
    this.counters = new Map();
    this.timers = new Map();
  }

  increment(metric, tags = {}) {
    const key = this._buildKey(metric, tags);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + 1);
    
    this.emit('metric', {
      type: 'counter',
      name: metric,
      value: current + 1,
      tags,
      timestamp: new Date().toISOString()
    });
  }

  timing(metric, duration, tags = {}) {
    const key = this._buildKey(metric, tags);
    if (!this.timers.has(key)) {
      this.timers.set(key, []);
    }
    this.timers.get(key).push(duration);
    
    this.emit('metric', {
      type: 'timer',
      name: metric,
      value: duration,
      tags,
      timestamp: new Date().toISOString()
    });
  }

  gauge(metric, value, tags = {}) {
    this.emit('metric', {
      type: 'gauge',
      name: metric,
      value,
      tags,
      timestamp: new Date().toISOString()
    });
  }

  getStats() {
    const stats = {
      counters: {},
      timers: {}
    };

    // Convert counters
    for (const [key, value] of this.counters) {
      stats.counters[key] = value;
    }

    // Calculate timer stats
    for (const [key, values] of this.timers) {
      if (values.length > 0) {
        const sorted = values.sort((a, b) => a - b);
        stats.timers[key] = {
          count: values.length,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          mean: values.reduce((a, b) => a + b, 0) / values.length,
          p50: sorted[Math.floor(values.length * 0.5)],
          p95: sorted[Math.floor(values.length * 0.95)],
          p99: sorted[Math.floor(values.length * 0.99)]
        };
      }
    }

    return stats;
  }

  reset() {
    this.counters.clear();
    this.timers.clear();
  }

  _buildKey(metric, tags) {
    const tagPairs = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return tagPairs ? `${metric}{${tagPairs}}` : metric;
  }
}

// Singleton instance
const metrics = new HttpMetrics();

// Log metrics to console in development
if (process.env.NODE_ENV !== 'production') {
  metrics.on('metric', (data) => {
    if (process.env.DEBUG_METRICS === 'true') {
      console.log(`[METRIC] ${data.name}:`, data);
    }
  });
}

module.exports = metrics;
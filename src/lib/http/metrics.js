const counters = new Map();
const gauges = new Map();

function key(name, tags) {
  if (!tags || Object.keys(tags).length === 0) return name;
  const parts = Object.entries(tags)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `${name}{${parts}}`;
}

function inc(name, value = 1, tags = {}) {
  const k = key(name, tags);
  counters.set(k, (counters.get(k) || 0) + value);
}

function setGauge(name, value, tags = {}) {
  const k = key(name, tags);
  gauges.set(k, value);
}

function snapshot() {
  return {
    counters: Object.fromEntries(counters.entries()),
    gauges: Object.fromEntries(gauges.entries()),
  };
}

module.exports = { inc, setGauge, snapshot };


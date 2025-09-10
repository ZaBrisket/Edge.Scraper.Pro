const counters = new Map();
const gauges = new Map();

function labelsKey(labels = {}) {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${String(labels[k])}`).join('|');
}

function incCounter(name, labels = {}, value = 1) {
  if (!counters.has(name)) counters.set(name, new Map());
  const bucket = counters.get(name);
  const key = labelsKey(labels);
  bucket.set(key, (bucket.get(key) || 0) + value);
}

function setGauge(name, labels = {}, value) {
  if (!gauges.has(name)) gauges.set(name, new Map());
  const bucket = gauges.get(name);
  const key = labelsKey(labels);
  bucket.set(key, value);
}

function snapshot() {
  const toObj = (m) => {
    const out = {};
    for (const [k, v] of m.entries()) out[k] = v;
    return out;
  };
  const countersSnapshot = {};
  for (const [name, m] of counters.entries()) countersSnapshot[name] = toObj(m);
  const gaugesSnapshot = {};
  for (const [name, m] of gauges.entries()) gaugesSnapshot[name] = toObj(m);
  return { counters: countersSnapshot, gauges: gaugesSnapshot, timestamp: new Date().toISOString() };
}

module.exports = {
  incCounter,
  setGauge,
  snapshot,
};


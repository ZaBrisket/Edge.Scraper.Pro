const { randomUUID } = require('crypto');

function getCorrelationId(event) {
  if (event && event.headers) {
    return event.headers['x-correlation-id'] || event.headers['X-Correlation-Id'] || randomUUID();
  }
  return randomUUID();
}

module.exports = { getCorrelationId };

const pino = require('pino');

const base = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
});

module.exports = function createLogger(correlationId) {
  return correlationId ? base.child({ correlationId }) : base;
};

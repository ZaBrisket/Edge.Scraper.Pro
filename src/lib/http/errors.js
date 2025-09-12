class HttpError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}

class NetworkError extends HttpError {
  constructor(message = 'Network error', meta = {}) {
    super('NETWORK_ERROR', message, meta);
  }
}

class RateLimitError extends HttpError {
  constructor(message = 'Rate limited', meta = {}) {
    super('RATE_LIMIT', message, meta);
  }
}

class TimeoutError extends HttpError {
  constructor(message = 'Request timed out', meta = {}) {
    super('TIMEOUT', message, meta);
  }
}

class CircuitOpenError extends HttpError {
  constructor(message = 'Circuit open', meta = {}) {
    super('CIRCUIT_OPEN', message, meta);
  }
}

class ParseError extends HttpError {
  constructor(message = 'Parse error', meta = {}) {
    super('PARSE_ERROR', message, meta);
  }
}

class ValidationError extends HttpError {
  constructor(message = 'Validation failed', meta = {}) {
    super('VALIDATION_ERROR', message, meta);
  }
}

module.exports = {
  HttpError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  CircuitOpenError,
  ParseError,
  ValidationError,
};

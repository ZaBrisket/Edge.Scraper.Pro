export class HttpError extends Error {
  code: string;
  meta: Record<string, any>;

  constructor(code: string, message: string, meta: Record<string, any> = {}) {
    super(message);
    this.code = code;
    this.meta = meta;
    this.name = this.constructor.name;
  }
}

export class NetworkError extends HttpError {
  constructor(message = 'Network error', meta: Record<string, any> = {}) {
    super('NETWORK_ERROR', message, meta);
  }
}

export class RateLimitError extends HttpError {
  constructor(message = 'Rate limited', meta: Record<string, any> = {}) {
    super('RATE_LIMIT', message, meta);
  }
}

export class TimeoutError extends HttpError {
  constructor(message = 'Request timed out', meta: Record<string, any> = {}) {
    super('TIMEOUT', message, meta);
  }
}

export class CircuitOpenError extends HttpError {
  constructor(message = 'Circuit open', meta: Record<string, any> = {}) {
    super('CIRCUIT_OPEN', message, meta);
  }
}

export class ParseError extends HttpError {
  constructor(message = 'Parse error', meta: Record<string, any> = {}) {
    super('PARSE_ERROR', message, meta);
  }
}

export class ValidationError extends HttpError {
  constructor(message = 'Validation failed', meta: Record<string, any> = {}) {
    super('VALIDATION_ERROR', message, meta);
  }
}

export declare class NetworkError extends Error {
  constructor(message: string, options?: any);
}

export declare class RateLimitError extends Error {
  constructor(message: string, options?: any);
}

export declare class TimeoutError extends Error {
  constructor(message: string, options?: any);
}

export declare class CircuitOpenError extends Error {
  constructor(message: string, options?: any);
}

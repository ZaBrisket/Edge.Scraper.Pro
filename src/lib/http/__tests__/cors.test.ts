import { corsHeaders } from '../cors';

describe('corsHeaders', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return default origin when no origin is provided', () => {
    delete process.env.ALLOWED_ORIGINS;
    const headers = corsHeaders();
    
    expect(headers['Access-Control-Allow-Origin']).toBe('https://edgescraperpro.com');
    expect(headers['Vary']).toBe('Origin');
    expect(headers['Access-Control-Allow-Methods']).toBe('GET,POST,OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization');
  });

  it('should reflect allowed origin when provided', () => {
    process.env.ALLOWED_ORIGINS = 'https://example.com,https://test.com';
    const headers = corsHeaders('https://test.com');
    
    expect(headers['Access-Control-Allow-Origin']).toBe('https://test.com');
  });

  it('should use first allowed origin when provided origin is not allowed', () => {
    process.env.ALLOWED_ORIGINS = 'https://example.com,https://test.com';
    const headers = corsHeaders('https://notallowed.com');
    
    expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
  });

  it('should handle environment variable with spaces', () => {
    process.env.ALLOWED_ORIGINS = 'https://example.com , https://test.com , https://another.com';
    const headers = corsHeaders('https://test.com');
    
    expect(headers['Access-Control-Allow-Origin']).toBe('https://test.com');
  });

  it('should include all required CORS headers', () => {
    const headers = corsHeaders();
    
    expect(headers).toHaveProperty('Access-Control-Allow-Origin');
    expect(headers).toHaveProperty('Vary', 'Origin');
    expect(headers).toHaveProperty('Access-Control-Allow-Methods');
    expect(headers).toHaveProperty('Access-Control-Allow-Headers');
  });
});
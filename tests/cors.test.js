const { withCORS } = require('../netlify/functions/_middleware');

describe('CORS Middleware', () => {
  test('handles OPTIONS preflight', async () => {
    const handler = jest.fn();
    const wrapped = withCORS(handler);
    
    const result = await wrapped(
      { httpMethod: 'OPTIONS', headers: { origin: 'https://edgescraperpro.com' } },
      {}
    );
    
    expect(result.statusCode).toBe(204);
    expect(result.headers['Access-Control-Allow-Origin']).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
  });

  test('adds correlation ID', async () => {
    const handler = jest.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    const wrapped = withCORS(handler);
    
    const result = await wrapped(
      { httpMethod: 'GET', headers: {} },
      {}
    );
    
    expect(result.headers['x-correlation-id']).toBeTruthy();
  });

  test('passes through handler response with CORS headers', async () => {
    const handler = jest.fn().mockResolvedValue({ 
      statusCode: 200, 
      body: JSON.stringify({ data: 'test' }) 
    });
    const wrapped = withCORS(handler);
    
    const result = await wrapped(
      { httpMethod: 'GET', headers: { origin: 'https://edgescraperpro.com' } },
      {}
    );
    
    expect(result.statusCode).toBe(200);
    expect(result.headers['Access-Control-Allow-Origin']).toBe('https://edgescraperpro.com');
    expect(result.headers['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
    expect(result.headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization, X-API-Key, Range');
    expect(result.headers['Vary']).toBe('Origin');
    expect(result.body).toBe(JSON.stringify({ data: 'test' }));
  });

  test('handles errors from handler', async () => {
    const handler = jest.fn().mockRejectedValue({ 
      statusCode: 400, 
      message: 'Bad request' 
    });
    const wrapped = withCORS(handler);
    
    const result = await wrapped(
      { httpMethod: 'GET', headers: {} },
      {}
    );
    
    expect(result.statusCode).toBe(400);
    expect(result.headers['Access-Control-Allow-Origin']).toBeTruthy();
    const body = JSON.parse(result.body);
    expect(body.ok).toBe(false);
    expect(body.error.message).toBe('Bad request');
  });

  test('handles uncaught errors', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('Uncaught error'));
    const wrapped = withCORS(handler);
    
    const result = await wrapped(
      { httpMethod: 'GET', headers: {} },
      {}
    );
    
    expect(result.statusCode).toBe(500);
    expect(result.headers['Access-Control-Allow-Origin']).toBeTruthy();
    const body = JSON.parse(result.body);
    expect(body.ok).toBe(false);
    expect(body.error.message).toBe('Uncaught error');
  });

  test('uses default origin when not provided', async () => {
    const handler = jest.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    const wrapped = withCORS(handler);
    
    const result = await wrapped(
      { httpMethod: 'GET', headers: {} },
      {}
    );
    
    expect(result.headers['Access-Control-Allow-Origin']).toBe('https://edgescraperpro.com');
  });

  test('preserves existing correlation ID', async () => {
    const handler = jest.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    const wrapped = withCORS(handler);
    const existingId = 'existing-correlation-id';
    
    const result = await wrapped(
      { httpMethod: 'GET', headers: { 'x-correlation-id': existingId } },
      {}
    );
    
    expect(result.headers['x-correlation-id']).toBe(existingId);
  });

  test('generates new correlation ID when not provided', async () => {
    const handler = jest.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    const wrapped = withCORS(handler);
    
    const result = await wrapped(
      { httpMethod: 'GET', headers: {} },
      {}
    );
    
    expect(result.headers['x-correlation-id']).toMatch(/^\d+-[a-z0-9]+$/);
  });

  test('passes correlation ID to handler context', async () => {
    let capturedContext;
    const handler = jest.fn().mockImplementation((event, context) => {
      capturedContext = context;
      return { statusCode: 200, body: '{}' };
    });
    const wrapped = withCORS(handler);
    
    await wrapped(
      { httpMethod: 'GET', headers: {} },
      {}
    );
    
    expect(capturedContext.correlationId).toBeTruthy();
  });
});
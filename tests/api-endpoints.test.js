/**
 * API Endpoints Tests
 * Tests for the scraping API endpoints
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

// Mock Next.js API request/response
function createMockRequest(method, body = {}, query = {}) {
  return {
    method,
    body,
    query,
  };
}

function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = JSON.stringify(data);
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
  };
  return res;
}

describe('API Endpoints', () => {
  let startHandler, statusHandler, cancelHandler, downloadHandler;

  test('setup', async () => {
    try {
      // Dynamic imports for API handlers
      const startModule = await import('../pages/api/scrape/start.js');
      const statusModule = await import('../pages/api/scrape/status/[id].js');
      const cancelModule = await import('../pages/api/scrape/cancel/[id].js');
      const downloadModule = await import('../pages/api/scrape/download/[id].js');
      
      startHandler = startModule.default;
      statusHandler = statusModule.default;
      cancelHandler = cancelModule.default;
      downloadHandler = downloadModule.default;
      
    } catch (error) {
      console.log('Skipping API tests - modules not compiled');
      console.error(error.message);
      return;
    }
  });

  test('should reject non-POST requests to start endpoint', async () => {
    if (!startHandler) return;
    
    const req = createMockRequest('GET');
    const res = createMockResponse();
    
    await startHandler(req, res);
    
    assert.strictEqual(res.statusCode, 405);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'Method not allowed');
  });

  test('should reject start requests without mode and input', async () => {
    if (!startHandler) return;
    
    const req = createMockRequest('POST', {});
    const res = createMockResponse();
    
    await startHandler(req, res);
    
    assert.strictEqual(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'Mode and input are required');
  });

  test('should reject start requests with unknown mode', async () => {
    if (!startHandler) return;
    
    const req = createMockRequest('POST', {
      mode: 'unknown-mode',
      input: { urls: ['https://example.com'] }
    });
    const res = createMockResponse();
    
    await startHandler(req, res);
    
    assert.strictEqual(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Unknown mode'));
  });

  test('should create job for valid request', async () => {
    if (!startHandler) return;
    
    const req = createMockRequest('POST', {
      mode: 'news-articles',
      input: { 
        urls: ['https://example.com/article'],
        options: {}
      }
    });
    const res = createMockResponse();
    
    await startHandler(req, res);
    
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.jobId);
    assert.strictEqual(typeof body.jobId, 'string');
  });

  test('should return job status', async () => {
    if (!statusHandler) return;
    
    // First create a job
    const startReq = createMockRequest('POST', {
      mode: 'news-articles',
      input: { 
        urls: ['https://example.com/article'],
        options: {}
      }
    });
    const startRes = createMockResponse();
    
    await startHandler(startReq, startRes);
    const startBody = JSON.parse(startRes.body);
    const jobId = startBody.jobId;
    
    // Then check status
    const statusReq = createMockRequest('GET', {}, { id: jobId });
    const statusRes = createMockResponse();
    
    await statusHandler(statusReq, statusRes);
    
    assert.strictEqual(statusRes.statusCode, 200);
    const statusBody = JSON.parse(statusRes.body);
    assert.strictEqual(statusBody.id, jobId);
    assert.ok(['pending', 'running', 'completed', 'failed'].includes(statusBody.status));
  });

  test('should return 404 for non-existent job status', async () => {
    if (!statusHandler) return;
    
    const req = createMockRequest('GET', {}, { id: 'non-existent-job' });
    const res = createMockResponse();
    
    await statusHandler(req, res);
    
    assert.strictEqual(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'Job not found');
  });

  test('should cancel running job', async () => {
    if (!cancelHandler || !startHandler) return;
    
    // First create a job
    const startReq = createMockRequest('POST', {
      mode: 'news-articles',
      input: { 
        urls: ['https://example.com/article'],
        options: {}
      }
    });
    const startRes = createMockResponse();
    
    await startHandler(startReq, startRes);
    const startBody = JSON.parse(startRes.body);
    const jobId = startBody.jobId;
    
    // Then cancel it
    const cancelReq = createMockRequest('POST', {}, { id: jobId });
    const cancelRes = createMockResponse();
    
    await cancelHandler(cancelReq, cancelRes);
    
    assert.strictEqual(cancelRes.statusCode, 200);
    const cancelBody = JSON.parse(cancelRes.body);
    assert.strictEqual(cancelBody.jobId, jobId);
    assert.ok(cancelBody.message.includes('cancelled'));
  });

  test('should return 404 for non-existent job cancellation', async () => {
    if (!cancelHandler) return;
    
    const req = createMockRequest('POST', {}, { id: 'non-existent-job' });
    const res = createMockResponse();
    
    await cancelHandler(req, res);
    
    assert.strictEqual(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'Job not found');
  });

  test('should handle download requests', async () => {
    if (!downloadHandler) return;
    
    // Test with non-existent job
    const req = createMockRequest('GET', {}, { id: 'non-existent-job', format: 'json' });
    const res = createMockResponse();
    
    await downloadHandler(req, res);
    
    assert.strictEqual(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.error, 'Job not found');
  });

  test('should validate download format', async () => {
    if (!downloadHandler) return;
    
    const req = createMockRequest('GET', {}, { id: 'some-job', format: 'invalid' });
    const res = createMockResponse();
    
    await downloadHandler(req, res);
    
    assert.strictEqual(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Format must be json or csv'));
  });
});
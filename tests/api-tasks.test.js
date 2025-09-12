/**
 * API Tasks Tests
 * Tests for the task API endpoints
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { handleStartRequest, handleStatusRequest, handleCancelRequest } = require('../api/controller');
const { jobs } = require('../api/dispatcher');

// Mock Next.js request/response objects
const createMockRequest = (method, body = {}) => ({
  method,
  body,
});

const createMockResponse = () => {
  const res = {
    status: (code) => {
      res.statusCode = code;
      return res;
    },
    json: (data) => {
      res.data = data;
      return res;
    },
  };
  return res;
};

describe('API Tasks', () => {
  beforeEach(() => {
    // Clear jobs
    jobs.clear();
  });

  afterEach(() => {
    jobs.clear();
  });

  describe('Start Request', () => {
    it('should handle valid start request', async () => {
      const req = createMockRequest('POST', {
        taskName: 'news',
        input: {
          urls: ['https://example.com/article1'],
          options: {},
        },
      });
      const res = createMockResponse();

      await handleStartRequest(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.data.jobId);
    });

    it('should reject non-POST requests', async () => {
      const req = createMockRequest('GET');
      const res = createMockResponse();

      await handleStartRequest(req, res);

      assert.strictEqual(res.statusCode, 405);
      assert.strictEqual(res.data.error, 'Method not allowed');
    });

    it('should reject requests without taskName', async () => {
      const req = createMockRequest('POST', {
        input: { urls: ['https://example.com/article1'] },
      });
      const res = createMockResponse();

      await handleStartRequest(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data.error, 'taskName and input are required');
    });

    it('should reject requests without input', async () => {
      const req = createMockRequest('POST', {
        taskName: 'news',
      });
      const res = createMockResponse();

      await handleStartRequest(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data.error, 'taskName and input are required');
    });
  });

  describe('Status Request', () => {
    it('should handle valid status request', async () => {
      // Create a job first
      const startReq = createMockRequest('POST', {
        taskName: 'news',
        input: {
          urls: ['https://example.com/article1'],
          options: {},
        },
      });
      const startRes = createMockResponse();
      await handleStartRequest(startReq, startRes);

      const jobId = startRes.data.jobId;
      const req = createMockRequest('GET');
      req.query = { jobId };
      const res = createMockResponse();

      await handleStatusRequest(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.jobId, jobId);
    });

    it('should reject non-GET requests', async () => {
      const req = createMockRequest('POST');
      const res = createMockResponse();

      await handleStatusRequest(req, res);

      assert.strictEqual(res.statusCode, 405);
      assert.strictEqual(res.data.error, 'Method not allowed');
    });

    it('should reject requests without jobId', async () => {
      const req = createMockRequest('GET');
      const res = createMockResponse();

      await handleStatusRequest(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data.error, 'jobId is required');
    });

    it('should return 404 for non-existent job', async () => {
      const req = createMockRequest('GET');
      req.query = { jobId: 'non-existent' };
      const res = createMockResponse();

      await handleStatusRequest(req, res);

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.data.error, 'Job not found');
    });
  });

  describe('Cancel Request', () => {
    it('should handle valid cancel request', async () => {
      // Create a job first
      const startReq = createMockRequest('POST', {
        taskName: 'news',
        input: {
          urls: ['https://example.com/article1'],
          options: {},
        },
      });
      const startRes = createMockResponse();
      await handleStartRequest(startReq, startRes);

      const jobId = startRes.data.jobId;
      const req = createMockRequest('POST', { jobId });
      const res = createMockResponse();

      await handleCancelRequest(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.success, true);
    });

    it('should reject non-POST requests', async () => {
      const req = createMockRequest('GET');
      const res = createMockResponse();

      await handleCancelRequest(req, res);

      assert.strictEqual(res.statusCode, 405);
      assert.strictEqual(res.data.error, 'Method not allowed');
    });

    it('should reject requests without jobId', async () => {
      const req = createMockRequest('POST', {});
      const res = createMockResponse();

      await handleCancelRequest(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data.error, 'jobId is required');
    });

    it('should return 404 for non-existent job', async () => {
      const req = createMockRequest('POST', { jobId: 'non-existent' });
      const res = createMockResponse();

      await handleCancelRequest(req, res);

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.data.error, 'Job not found');
    });
  });
});
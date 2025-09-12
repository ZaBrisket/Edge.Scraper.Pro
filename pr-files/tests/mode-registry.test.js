/**
 * Mode Registry Tests
 * Tests for the mode registry system
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { z } = require('zod');

// Mock mode implementation for testing
class TestMode {
  constructor(id = 'test-mode') {
    this.id = id;
    this.label = 'Test Mode';
    this.description = 'A test mode for unit testing';
    this.version = '1.0.0';
    this.inputSchema = z.object({
      urls: z.array(z.string()),
      options: z.object({}).optional(),
    });
    this.outputSchema = z.object({
      results: z.array(z.any()),
      summary: z.object({
        total: z.number(),
        successful: z.number(),
        failed: z.number(),
      }),
    });
    this.uiHints = {
      inputType: 'urls',
      supportsBatch: true,
      supportsProgress: true,
      estimatedTimePerUrl: 1000,
    };
  }

  async run(input, context) {
    return {
      results: input.urls.map(url => ({ url, success: true })),
      summary: {
        total: input.urls.length,
        successful: input.urls.length,
        failed: 0,
      },
    };
  }

  async validate(input) {
    return { valid: true };
  }
}

describe('Mode Registry', () => {
  let ModeRegistry;
  let registry;

  // Dynamic import since we're using TypeScript modules
  test('setup', async () => {
    try {
      const module = await import('../dist/modes/registry.js');
      ModeRegistry = module.ModeRegistry;
      registry = new ModeRegistry();
    } catch (error) {
      // If compiled version doesn't exist, skip tests
      console.log('Skipping mode registry tests - TypeScript not compiled');
      return;
    }
  });

  test('should register a mode successfully', async () => {
    if (!ModeRegistry) return;
    
    const testMode = new TestMode();
    registry.register(testMode);
    
    assert.ok(registry.hasMode('test-mode'));
    
    const modes = registry.listModes();
    assert.strictEqual(modes.length, 1);
    assert.strictEqual(modes[0].id, 'test-mode');
    assert.strictEqual(modes[0].label, 'Test Mode');
  });

  test('should retrieve a registered mode', async () => {
    if (!ModeRegistry) return;
    
    const testMode = new TestMode('retrieve-test');
    registry.register(testMode);
    
    const retrievedMode = registry.getMode('retrieve-test');
    assert.strictEqual(retrievedMode.id, 'retrieve-test');
    assert.strictEqual(retrievedMode.label, 'Test Mode');
  });

  test('should throw error for non-existent mode', async () => {
    if (!ModeRegistry) return;
    
    assert.throws(() => {
      registry.getMode('non-existent-mode');
    });
  });

  test('should validate mode input', async () => {
    if (!ModeRegistry) return;
    
    const testMode = new TestMode('validation-test');
    registry.register(testMode);
    
    const validInput = {
      urls: ['https://example.com'],
      options: {},
    };
    
    const validation = await registry.validateInput('validation-test', validInput);
    assert.strictEqual(validation.valid, true);
  });

  test('should execute mode successfully', async () => {
    if (!ModeRegistry) return;
    
    const testMode = new TestMode('execution-test');
    registry.register(testMode);
    
    const input = {
      urls: ['https://example.com', 'https://test.com'],
      options: {},
    };
    
    const context = {
      jobId: 'test-job',
      correlationId: 'test-correlation',
      logger: console,
      httpClient: null,
    };
    
    const result = await registry.execute('execution-test', input, context);
    
    assert.strictEqual(result.summary.total, 2);
    assert.strictEqual(result.summary.successful, 2);
    assert.strictEqual(result.summary.failed, 0);
    assert.strictEqual(result.results.length, 2);
  });

  test('should track usage statistics', async () => {
    if (!ModeRegistry) return;
    
    const statsRegistry = new ModeRegistry();
    const testMode = new TestMode('stats-test');
    statsRegistry.register(testMode);
    
    // Execute mode multiple times
    const input = { urls: ['https://example.com'], options: {} };
    const context = {
      jobId: 'test-job',
      correlationId: 'test-correlation',
      logger: console,
      httpClient: null,
    };
    
    await statsRegistry.execute('stats-test', input, context);
    await statsRegistry.execute('stats-test', input, context);
    
    const modes = statsRegistry.listModes();
    const statsMode = modes.find(m => m.id === 'stats-test');
    
    assert.strictEqual(statsMode.usageCount, 2);
    assert.ok(statsMode.lastUsed instanceof Date);
  });

  test('should enable/disable modes', async () => {
    if (!ModeRegistry) return;
    
    const testMode = new TestMode('enable-test');
    registry.register(testMode);
    
    // Mode should be enabled by default
    assert.ok(registry.getMode('enable-test'));
    
    // Disable mode
    registry.setModeEnabled('enable-test', false);
    
    assert.throws(() => {
      registry.getMode('enable-test');
    });
    
    // Re-enable mode
    registry.setModeEnabled('enable-test', true);
    assert.ok(registry.getMode('enable-test'));
  });

  test('should provide registry statistics', async () => {
    if (!ModeRegistry) return;
    
    registry.clear();
    
    const mode1 = new TestMode('stats-1');
    const mode2 = new TestMode('stats-2');
    
    registry.register(mode1);
    registry.register(mode2);
    
    const stats = registry.getStats();
    
    assert.strictEqual(stats.totalModes, 2);
    assert.strictEqual(stats.enabledModes, 2);
    assert.strictEqual(stats.disabledModes, 0);
    assert.strictEqual(stats.totalUsage, 0);
  });

  test('should unregister modes', async () => {
    if (!ModeRegistry) return;
    
    const testMode = new TestMode('unregister-test');
    registry.register(testMode);
    
    assert.ok(registry.hasMode('unregister-test'));
    
    const unregistered = registry.unregister('unregister-test');
    assert.strictEqual(unregistered, true);
    assert.strictEqual(registry.hasMode('unregister-test'), false);
    
    // Try to unregister non-existent mode
    const notFound = registry.unregister('non-existent');
    assert.strictEqual(notFound, false);
  });
});
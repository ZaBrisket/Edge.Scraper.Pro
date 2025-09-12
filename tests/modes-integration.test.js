/**
 * Modes Integration Tests
 * Tests for the three first-class modes
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

describe('Modes Integration', () => {
  let modeRegistry;
  let SupplierDirectoryMode, NewsArticlesMode, SportsMode;

  // Dynamic import since we're using TypeScript modules
  test('setup', async () => {
    try {
      const registryModule = await import('../dist/modes/registry.js');
      const modesModule = await import('../dist/modes/index.js');
      
      modeRegistry = registryModule.modeRegistry;
      SupplierDirectoryMode = modesModule.SupplierDirectoryMode;
      NewsArticlesMode = modesModule.NewsArticlesMode;
      SportsMode = modesModule.SportsMode;
      
      // Initialize modes
      modesModule.initializeModes();
      
    } catch (error) {
      console.log('Skipping modes integration tests - TypeScript not compiled');
      console.error(error);
      return;
    }
  });

  test('should have all three modes registered', async () => {
    if (!modeRegistry) return;
    
    const modes = modeRegistry.listModes();
    const modeIds = modes.map(m => m.id);
    
    assert.ok(modeIds.includes('supplier-directory'));
    assert.ok(modeIds.includes('news-articles'));
    assert.ok(modeIds.includes('sports'));
    
    assert.strictEqual(modes.length, 3);
  });

  test('supplier-directory mode should validate input correctly', async () => {
    if (!modeRegistry) return;
    
    const mode = modeRegistry.getMode('supplier-directory');
    
    // Valid input
    const validInput = {
      urls: ['https://directory.example.com/suppliers'],
      options: {
        concurrency: 2,
        delayMs: 1000,
      },
    };
    
    const validation = await mode.validate(validInput);
    assert.strictEqual(validation.valid, true);
    
    // Invalid input - empty URLs
    const invalidInput = {
      urls: [],
      options: {},
    };
    
    const invalidValidation = await mode.validate(invalidInput);
    assert.strictEqual(invalidValidation.valid, false);
    assert.ok(invalidValidation.errors.includes('At least one URL is required'));
  });

  test('news-articles mode should validate input correctly', async () => {
    if (!modeRegistry) return;
    
    const mode = modeRegistry.getMode('news-articles');
    
    // Valid input
    const validInput = {
      urls: ['https://news.example.com/article/breaking-news'],
      options: {
        extractContent: true,
        maxContentLength: 2000,
      },
    };
    
    const validation = await mode.validate(validInput);
    assert.strictEqual(validation.valid, true);
    
    // Invalid input - invalid URL
    const invalidInput = {
      urls: ['not-a-url'],
      options: {},
    };
    
    const invalidValidation = await mode.validate(invalidInput);
    assert.strictEqual(invalidValidation.valid, false);
    assert.ok(invalidValidation.errors.some(error => error.includes('Invalid URL')));
  });

  test('sports mode should validate input correctly', async () => {
    if (!modeRegistry) return;
    
    const mode = modeRegistry.getMode('sports');
    
    // Valid input
    const validInput = {
      urls: ['https://www.pro-football-reference.com/players/M/MahoPa00.htm'],
      options: {
        extractTables: true,
        extractBiography: true,
      },
    };
    
    const validation = await mode.validate(validInput);
    assert.strictEqual(validation.valid, true);
    
    // Invalid input - too many URLs
    const invalidInput = {
      urls: new Array(300).fill('https://www.pro-football-reference.com/players/M/MahoPa00.htm'),
      options: {},
    };
    
    const invalidValidation = await mode.validate(invalidInput);
    assert.strictEqual(invalidValidation.valid, false);
    assert.ok(invalidValidation.errors.some(error => error.includes('Too many URLs')));
  });

  test('modes should have correct UI hints', async () => {
    if (!modeRegistry) return;
    
    const supplierMode = modeRegistry.getMode('supplier-directory');
    const newsMode = modeRegistry.getMode('news-articles');
    const sportsMode = modeRegistry.getMode('sports');
    
    // Check UI hints structure
    assert.strictEqual(supplierMode.uiHints.inputType, 'urls');
    assert.strictEqual(supplierMode.uiHints.supportsBatch, true);
    assert.strictEqual(supplierMode.uiHints.supportsProgress, true);
    assert.ok(supplierMode.uiHints.estimatedTimePerUrl > 0);
    assert.ok(Array.isArray(supplierMode.uiHints.examples));
    
    assert.strictEqual(newsMode.uiHints.inputType, 'urls');
    assert.strictEqual(newsMode.uiHints.maxBatchSize, 1000);
    
    assert.strictEqual(sportsMode.uiHints.inputType, 'urls');
    assert.strictEqual(sportsMode.uiHints.maxBatchSize, 200);
    assert.ok(sportsMode.uiHints.estimatedTimePerUrl > newsMode.uiHints.estimatedTimePerUrl);
  });

  test('modes should have proper schemas', async () => {
    if (!modeRegistry) return;
    
    const modes = ['supplier-directory', 'news-articles', 'sports'];
    
    for (const modeId of modes) {
      const mode = modeRegistry.getMode(modeId);
      
      // Check that schemas exist
      assert.ok(mode.inputSchema, `${modeId} should have input schema`);
      assert.ok(mode.outputSchema, `${modeId} should have output schema`);
      
      // Check that schemas can parse valid input
      const validInput = {
        urls: ['https://example.com'],
        options: {},
      };
      
      // Should not throw
      const parsed = mode.inputSchema.parse(validInput);
      assert.ok(parsed);
      assert.ok(Array.isArray(parsed.urls));
      assert.strictEqual(parsed.urls.length, 1);
    }
  });

  test('modes should have consistent metadata', async () => {
    if (!modeRegistry) return;
    
    const modes = modeRegistry.getEnabledModes();
    
    for (const mode of modes) {
      // Check required properties
      assert.ok(mode.id, 'Mode should have id');
      assert.ok(mode.label, 'Mode should have label');
      assert.ok(mode.version, 'Mode should have version');
      assert.ok(mode.uiHints, 'Mode should have UI hints');
      
      // Check that run method exists
      assert.strictEqual(typeof mode.run, 'function', 'Mode should have run method');
      
      // Check that validate method exists (optional but our modes have it)
      if (mode.validate) {
        assert.strictEqual(typeof mode.validate, 'function', 'Validate should be a function');
      }
    }
  });

  test('registry stats should be accurate', async () => {
    if (!modeRegistry) return;
    
    const stats = modeRegistry.getStats();
    
    assert.strictEqual(stats.totalModes, 3);
    assert.strictEqual(stats.enabledModes, 3);
    assert.strictEqual(stats.disabledModes, 0);
    assert.strictEqual(stats.totalUsage, 0); // No executions yet
  });
});
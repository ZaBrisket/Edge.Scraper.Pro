/**
 * Storage Tests
 * Tests for the storage functionality
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { MemoryStorage } = require('../core/storage');

describe('Memory Storage', () => {
  let storage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  afterEach(() => {
    storage.clear();
  });

  describe('Basic Operations', () => {
    it('should set and get values', async () => {
      await storage.set('test-key', 'test-value');
      const value = await storage.get('test-key');
      assert.strictEqual(value, 'test-value');
    });

    it('should return null for non-existent keys', async () => {
      const value = await storage.get('non-existent');
      assert.strictEqual(value, null);
    });

    it('should handle different data types', async () => {
      const testData = {
        string: 'test',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        object: { nested: 'value' },
      };

      await storage.set('test-object', testData);
      const retrieved = await storage.get('test-object');
      assert.deepStrictEqual(retrieved, testData);
    });
  });

  describe('Existence Checking', () => {
    it('should return false for non-existent keys', async () => {
      const exists = await storage.exists('non-existent');
      assert.strictEqual(exists, false);
    });

    it('should return true for existing keys', async () => {
      await storage.set('test-key', 'test-value');
      const exists = await storage.exists('test-key');
      assert.strictEqual(exists, true);
    });
  });

  describe('Deletion', () => {
    it('should delete existing keys', async () => {
      await storage.set('test-key', 'test-value');
      await storage.delete('test-key');
      const value = await storage.get('test-key');
      assert.strictEqual(value, null);
    });

    it('should handle deletion of non-existent keys', async () => {
      await storage.delete('non-existent');
      // Should not throw
    });
  });

  describe('Key Listing', () => {
    it('should list all keys', async () => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      await storage.set('key3', 'value3');

      const keys = await storage.keys();
      assert.strictEqual(keys.length, 3);
      assert(keys.includes('key1'));
      assert(keys.includes('key2'));
      assert(keys.includes('key3'));
    });

    it('should filter keys by pattern', async () => {
      await storage.set('user-1', 'value1');
      await storage.set('user-2', 'value2');
      await storage.set('session-1', 'value3');

      const userKeys = await storage.keys('user-*');
      assert.strictEqual(userKeys.length, 2);
      assert(userKeys.includes('user-1'));
      assert(userKeys.includes('user-2'));
    });

    it('should return empty array when no keys match pattern', async () => {
      await storage.set('key1', 'value1');
      const keys = await storage.keys('non-matching-*');
      assert.strictEqual(keys.length, 0);
    });
  });

  describe('Clear Operation', () => {
    it('should clear all keys', async () => {
      await storage.set('key1', 'value1');
      await storage.set('key2', 'value2');
      await storage.clear();

      const keys = await storage.keys();
      assert.strictEqual(keys.length, 0);
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire keys after TTL', async () => {
      await storage.set('test-key', 'test-value', 1); // 1 second TTL
      
      // Key should exist immediately
      let value = await storage.get('test-key');
      assert.strictEqual(value, 'test-value');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Key should be expired
      value = await storage.get('test-key');
      assert.strictEqual(value, null);
    });

    it('should not expire keys without TTL', async () => {
      await storage.set('test-key', 'test-value');
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Key should still exist
      const value = await storage.get('test-key');
      assert.strictEqual(value, 'test-value');
    });

    it('should handle very short TTL', async () => {
      await storage.set('test-key', 'test-value', 0.1); // 100ms TTL
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Key should be expired
      const value = await storage.get('test-key');
      assert.strictEqual(value, null);
    });
  });

  describe('Error Handling', () => {
    it('should handle concurrent operations', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(storage.set(`key-${i}`, `value-${i}`));
      }

      await Promise.all(promises);

      const keys = await storage.keys();
      assert.strictEqual(keys.length, 100);
    });

    it('should handle mixed operations', async () => {
      const operations = [];
      for (let i = 0; i < 50; i++) {
        operations.push(storage.set(`key-${i}`, `value-${i}`));
        operations.push(storage.get(`key-${i}`));
        operations.push(storage.exists(`key-${i}`));
      }

      await Promise.all(operations);

      const keys = await storage.keys();
      assert.strictEqual(keys.length, 50);
    });
  });
});
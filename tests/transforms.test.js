const { test, describe } = require('node:test');
const assert = require('node:assert');

// Mock transforms for testing
const transforms = {
  trim: (value) => typeof value === 'string' ? value.trim() : value,
  titleCase: (value) => {
    if (typeof value !== 'string') return value;
    return value.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  },
  currencyToFloat: (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const cleaned = value.replace(/[$,\s]/g, '');
      let multiplier = 1;
      if (cleaned.toLowerCase().includes('m')) {
        multiplier = 1000000;
      } else if (cleaned.toLowerCase().includes('k')) {
        multiplier = 1000;
      }
      const number = parseFloat(cleaned.replace(/[^0-9.-]/g, ''));
      if (isNaN(number)) return null;
      return number * multiplier;
    }
    return null;
  },
  sanitizeForExcel: (value) => {
    if (typeof value !== 'string') return value;
    if (/^[=+\-@]/.test(value)) {
      return `'${value}`;
    }
    return value;
  },
};

describe('Data Transforms', () => {
  test('trim should remove whitespace', () => {
    assert.strictEqual(transforms.trim('  hello world  '), 'hello world');
    assert.strictEqual(transforms.trim('no-trim'), 'no-trim');
    assert.strictEqual(transforms.trim(123), 123);
  });

  test('titleCase should capitalize words', () => {
    assert.strictEqual(transforms.titleCase('hello world'), 'Hello World');
    assert.strictEqual(transforms.titleCase('UPPERCASE TEXT'), 'Uppercase Text');
    assert.strictEqual(transforms.titleCase('mixed CaSe'), 'Mixed Case');
  });

  test('currencyToFloat should parse currency values', () => {
    assert.strictEqual(transforms.currencyToFloat('$1,234.56'), 1234.56);
    assert.strictEqual(transforms.currencyToFloat('$5.2M'), 5200000);
    assert.strictEqual(transforms.currencyToFloat('1.5K'), 1500);
    assert.strictEqual(transforms.currencyToFloat('invalid'), null);
    assert.strictEqual(transforms.currencyToFloat(1000), 1000);
  });

  test('sanitizeForExcel should prevent injection', () => {
    assert.strictEqual(transforms.sanitizeForExcel('=SUM(A1:A10)'), "'=SUM(A1:A10)");
    assert.strictEqual(transforms.sanitizeForExcel('+1+1'), "'+1+1");
    assert.strictEqual(transforms.sanitizeForExcel('-5'), "'-5");
    assert.strictEqual(transforms.sanitizeForExcel('@user'), "'@user");
    assert.strictEqual(transforms.sanitizeForExcel('safe text'), 'safe text');
  });

  test('should handle null and undefined values', () => {
    assert.strictEqual(transforms.trim(null), null);
    assert.strictEqual(transforms.titleCase(undefined), undefined);
    assert.strictEqual(transforms.currencyToFloat(null), null);
  });
});
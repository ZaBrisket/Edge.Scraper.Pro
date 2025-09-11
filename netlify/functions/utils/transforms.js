/**
 * Simple data transformation utilities for Netlify Functions
 */

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

function applyTransform(transformName, value) {
  const transform = transforms[transformName];
  if (!transform) {
    return value;
  }
  
  try {
    return transform(value);
  } catch (error) {
    return value;
  }
}

function transformRow(row, mapping, fieldDefs) {
  const transformedRow = {};
  const fieldDefMap = new Map(fieldDefs.map(fd => [fd.targetField, fd]));

  for (const [sourceHeader, targetField] of Object.entries(mapping)) {
    if (!targetField) continue;
    
    const fieldDef = fieldDefMap.get(targetField);
    let value = row[sourceHeader];
    
    if ((value === null || value === undefined || value === '') && fieldDef?.defaultValue) {
      value = fieldDef.defaultValue;
    }
    
    if (fieldDef?.transform && value !== null && value !== undefined) {
      value = applyTransform(fieldDef.transform, value);
    }
    
    transformedRow[targetField] = value;
  }

  return transformedRow;
}

module.exports = {
  transformRow,
  applyTransform,
  transforms,
};
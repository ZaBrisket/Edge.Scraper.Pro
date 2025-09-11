"use strict";
/**
 * Data transformation utilities for normalizing CSV/Excel data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.transforms = void 0;
exports.applyTransform = applyTransform;
exports.applyTransforms = applyTransforms;
exports.transformRow = transformRow;
exports.validateTransforms = validateTransforms;
exports.getAvailableTransforms = getAvailableTransforms;
/**
 * Registry of available transforms
 */
exports.transforms = {
    // String transformations
    trim: (value) => typeof value === 'string' ? value.trim() : value,
    titleCase: (value) => {
        if (typeof value !== 'string')
            return value;
        return value.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    },
    upperCase: (value) => typeof value === 'string' ? value.toUpperCase() : value,
    toLowerCase: (value) => typeof value === 'string' ? value.toLowerCase() : value,
    // Numeric transformations
    parseInt: (value) => {
        if (typeof value === 'number')
            return Math.floor(value);
        if (typeof value === 'string') {
            const parsed = parseInt(value.replace(/[^0-9-]/g, ''), 10);
            return isNaN(parsed) ? null : parsed;
        }
        return null;
    },
    parseFloat: (value) => {
        if (typeof value === 'number')
            return value;
        if (typeof value === 'string') {
            const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
            return isNaN(parsed) ? null : parsed;
        }
        return null;
    },
    // Currency transformations
    currencyToFloat: (value) => {
        if (typeof value === 'number')
            return value;
        if (typeof value === 'string') {
            // Remove currency symbols, commas, and spaces
            const cleaned = value.replace(/[$,\s]/g, '');
            // Handle millions/thousands abbreviations
            let multiplier = 1;
            if (cleaned.toLowerCase().includes('m')) {
                multiplier = 1000000;
            }
            else if (cleaned.toLowerCase().includes('k')) {
                multiplier = 1000;
            }
            const number = parseFloat(cleaned.replace(/[^0-9.-]/g, ''));
            if (isNaN(number))
                return null;
            return number * multiplier;
        }
        return null;
    },
    // URL transformations
    normalizeUrl: (value) => {
        if (typeof value !== 'string')
            return value;
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        // Add protocol if missing
        if (!/^https?:\/\//i.test(trimmed)) {
            return `https://${trimmed}`;
        }
        return trimmed;
    },
    // Date transformations
    parseDate: (value) => {
        if (value instanceof Date)
            return value.toISOString();
        if (typeof value === 'string') {
            const parsed = new Date(value);
            return isNaN(parsed.getTime()) ? null : parsed.toISOString();
        }
        return null;
    },
    // Phone number transformations
    normalizePhone: (value) => {
        if (typeof value !== 'string')
            return value;
        // Extract only digits
        const digits = value.replace(/\D/g, '');
        if (digits.length === 10) {
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        }
        else if (digits.length === 11 && digits[0] === '1') {
            return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
        }
        return value; // Return original if can't normalize
    },
    // Email transformations
    normalizeEmail: (value) => {
        if (typeof value !== 'string')
            return value;
        return value.toLowerCase().trim();
    },
    // State abbreviation normalization
    normalizeState: (value) => {
        if (typeof value !== 'string')
            return value;
        const stateMap = {
            'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
            'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
            'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
            'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
            'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
            'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
            'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
            'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
            'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
            'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
            'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
            'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
            'wisconsin': 'WI', 'wyoming': 'WY'
        };
        const normalized = value.toLowerCase().trim();
        return stateMap[normalized] || value.toUpperCase();
    },
    // Remove common prefixes/suffixes
    removeCompanyDesignators: (value) => {
        if (typeof value !== 'string')
            return value;
        const designators = [
            'inc', 'incorporated', 'corp', 'corporation', 'ltd', 'limited',
            'llc', 'llp', 'lp', 'co', 'company', 'group', 'holdings'
        ];
        let cleaned = value.trim();
        for (const designator of designators) {
            const regex = new RegExp(`\\b${designator}\\.?$`, 'i');
            cleaned = cleaned.replace(regex, '').trim();
        }
        return cleaned;
    },
    // Security: Prevent CSV injection
    sanitizeForExcel: (value) => {
        if (typeof value !== 'string')
            return value;
        // Escape dangerous characters that could be interpreted as formulas
        if (/^[=+\-@]/.test(value)) {
            return `'${value}`;
        }
        return value;
    },
};
/**
 * Apply a transform by name to a value
 */
function applyTransform(transformName, value) {
    const transform = exports.transforms[transformName];
    if (!transform) {
        console.warn(`Unknown transform: ${transformName}`);
        return value;
    }
    try {
        return transform(value);
    }
    catch (error) {
        console.error(`Transform ${transformName} failed for value:`, value, error);
        return value; // Return original value on error
    }
}
/**
 * Apply multiple transforms in sequence
 */
function applyTransforms(transformNames, value) {
    return transformNames.reduce((currentValue, transformName) => {
        return applyTransform(transformName, currentValue);
    }, value);
}
/**
 * Transform a row of data according to field definitions
 */
function transformRow(row, mapping, // sourceHeader -> targetField
fieldDefs) {
    const transformedRow = {};
    const fieldDefMap = new Map(fieldDefs.map(fd => [fd.targetField, fd]));
    // Apply mappings and transforms
    for (const [sourceHeader, targetField] of Object.entries(mapping)) {
        if (!targetField)
            continue;
        const fieldDef = fieldDefMap.get(targetField);
        let value = row[sourceHeader];
        // Apply default value if empty
        if ((value === null || value === undefined || value === '') && fieldDef?.defaultValue) {
            value = fieldDef.defaultValue;
        }
        // Apply transforms
        if (fieldDef?.transform && value !== null && value !== undefined) {
            const transformNames = fieldDef.transform.split(',').map(t => t.trim());
            value = applyTransforms(transformNames, value);
        }
        transformedRow[targetField] = value;
    }
    return transformedRow;
}
/**
 * Validate transform names
 */
function validateTransforms(transformNames) {
    const valid = [];
    const invalid = [];
    for (const name of transformNames) {
        if (exports.transforms[name]) {
            valid.push(name);
        }
        else {
            invalid.push(name);
        }
    }
    return { valid, invalid };
}
/**
 * Get list of available transforms with descriptions
 */
function getAvailableTransforms() {
    return [
        { name: 'trim', description: 'Remove leading/trailing whitespace', category: 'String' },
        { name: 'titleCase', description: 'Convert to Title Case', category: 'String' },
        { name: 'upperCase', description: 'Convert to UPPERCASE', category: 'String' },
        { name: 'toLowerCase', description: 'Convert to lowercase', category: 'String' },
        { name: 'parseInt', description: 'Convert to integer', category: 'Numeric' },
        { name: 'parseFloat', description: 'Convert to decimal number', category: 'Numeric' },
        { name: 'currencyToFloat', description: 'Parse currency values ($1.2M → 1200000)', category: 'Numeric' },
        { name: 'normalizeUrl', description: 'Add https:// if missing', category: 'URL' },
        { name: 'parseDate', description: 'Convert to ISO date format', category: 'Date' },
        { name: 'normalizePhone', description: 'Format as (555) 123-4567', category: 'Contact' },
        { name: 'normalizeEmail', description: 'Lowercase and trim email', category: 'Contact' },
        { name: 'normalizeState', description: 'Convert state names to abbreviations', category: 'Geographic' },
        { name: 'removeCompanyDesignators', description: 'Remove Inc, Corp, LLC, etc.', category: 'Company' },
        { name: 'sanitizeForExcel', description: 'Prevent CSV injection attacks', category: 'Security' },
    ];
}
//# sourceMappingURL=transforms.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoMapHeaders = autoMapHeaders;
exports.suggestMappings = suggestMappings;
exports.validateMapping = validateMapping;
exports.calculateMappingConfidence = calculateMappingConfidence;
/**
 * Normalize header names for comparison
 */
function normalizeHeader(header) {
    return header
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
}
/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateSimilarity(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    if (len1 === 0)
        return len2;
    if (len2 === 0)
        return len1;
    const matrix = [];
    for (let i = 0; i <= len2; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len1; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= len2; i++) {
        for (let j = 1; j <= len1; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            }
            else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                matrix[i][j - 1] + 1, // insertion
                matrix[i - 1][j] + 1 // deletion
                );
            }
        }
    }
    const maxLen = Math.max(len1, len2);
    return (maxLen - matrix[len2][len1]) / maxLen;
}
/**
 * Find the best matching field definition for a source header
 */
function findBestMatch(sourceHeader, fieldDefs, threshold = 0.6) {
    const normalizedSource = normalizeHeader(sourceHeader);
    let bestMatch = null;
    let bestScore = 0;
    for (const fieldDef of fieldDefs) {
        for (const candidateHeader of fieldDef.sourceHeaders) {
            const normalizedCandidate = normalizeHeader(candidateHeader);
            // Exact match gets highest score
            if (normalizedSource === normalizedCandidate) {
                return {
                    sourceHeader,
                    targetField: fieldDef.targetField,
                    confidence: 1.0,
                    fieldDef,
                };
            }
            // Partial match using similarity
            const similarity = calculateSimilarity(normalizedSource, normalizedCandidate);
            if (similarity > bestScore && similarity >= threshold) {
                bestScore = similarity;
                bestMatch = {
                    sourceHeader,
                    targetField: fieldDef.targetField,
                    confidence: similarity,
                    fieldDef,
                };
            }
            // Check if source header contains candidate or vice versa
            if (normalizedSource.includes(normalizedCandidate) ||
                normalizedCandidate.includes(normalizedSource)) {
                const containmentScore = Math.min(normalizedCandidate.length / normalizedSource.length, normalizedSource.length / normalizedCandidate.length) * 0.8; // Slightly lower than exact match
                if (containmentScore > bestScore && containmentScore >= threshold) {
                    bestScore = containmentScore;
                    bestMatch = {
                        sourceHeader,
                        targetField: fieldDef.targetField,
                        confidence: containmentScore,
                        fieldDef,
                    };
                }
            }
        }
    }
    return bestMatch;
}
/**
 * Auto-map source headers to target fields using field definitions
 */
function autoMapHeaders(sourceHeaders, fieldDefs, confidenceThreshold = 0.6) {
    const matches = [];
    const unmappedHeaders = [];
    const usedTargetFields = new Set();
    // First pass: find matches for each source header
    for (const sourceHeader of sourceHeaders) {
        const match = findBestMatch(sourceHeader, fieldDefs, confidenceThreshold);
        if (match && !usedTargetFields.has(match.targetField)) {
            matches.push(match);
            usedTargetFields.add(match.targetField);
        }
        else {
            unmappedHeaders.push(sourceHeader);
        }
    }
    // Check for required fields that are missing
    const requiredFieldsMissing = fieldDefs
        .filter(fieldDef => fieldDef.required)
        .map(fieldDef => fieldDef.targetField)
        .filter(targetField => !usedTargetFields.has(targetField));
    // Calculate overall confidence
    const totalConfidence = matches.reduce((sum, match) => sum + match.confidence, 0);
    const averageConfidence = matches.length > 0 ? totalConfidence / matches.length : 0;
    // Penalize for missing required fields
    const requiredFieldsPenalty = requiredFieldsMissing.length * 0.2;
    const overallConfidence = Math.max(0, averageConfidence - requiredFieldsPenalty);
    return {
        matches,
        unmappedHeaders,
        requiredFieldsMissing,
        confidence: overallConfidence,
    };
}
/**
 * Suggest possible mappings for unmapped headers
 */
function suggestMappings(unmappedHeaders, fieldDefs, usedTargetFields, threshold = 0.3 // Lower threshold for suggestions
) {
    return unmappedHeaders.map(sourceHeader => {
        const suggestions = [];
        for (const fieldDef of fieldDefs) {
            if (usedTargetFields.has(fieldDef.targetField)) {
                continue; // Skip already mapped fields
            }
            const match = findBestMatch(sourceHeader, [fieldDef], threshold);
            if (match) {
                suggestions.push({
                    targetField: fieldDef.targetField,
                    confidence: match.confidence,
                    fieldDef,
                });
            }
        }
        // Sort suggestions by confidence (descending)
        suggestions.sort((a, b) => b.confidence - a.confidence);
        return {
            sourceHeader,
            suggestions: suggestions.slice(0, 3), // Top 3 suggestions
        };
    });
}
/**
 * Validate a manual mapping configuration
 */
function validateMapping(mapping, // sourceHeader -> targetField
fieldDefs) {
    const errors = [];
    const warnings = [];
    const targetFieldsMap = new Map(fieldDefs.map(fd => [fd.targetField, fd]));
    const usedTargetFields = new Set();
    // Check each mapping
    for (const [sourceHeader, targetField] of Object.entries(mapping)) {
        if (!targetField)
            continue; // Skip empty mappings
        const fieldDef = targetFieldsMap.get(targetField);
        if (!fieldDef) {
            errors.push(`Unknown target field: ${targetField}`);
            continue;
        }
        if (usedTargetFields.has(targetField)) {
            errors.push(`Duplicate mapping for target field: ${targetField}`);
        }
        else {
            usedTargetFields.add(targetField);
        }
    }
    // Check for missing required fields
    const requiredFields = fieldDefs.filter(fd => fd.required);
    for (const fieldDef of requiredFields) {
        if (!usedTargetFields.has(fieldDef.targetField)) {
            errors.push(`Required field not mapped: ${fieldDef.targetField}`);
        }
    }
    // Check for unmapped source headers that might be important
    const mappedSourceHeaders = new Set(Object.keys(mapping));
    // This would need the original source headers to provide meaningful warnings
    return {
        isValid: errors.length === 0,
        errors,
        warnings,
    };
}
/**
 * Generate confidence score for a complete mapping
 */
function calculateMappingConfidence(mapping, sourceHeaders, fieldDefs) {
    const mappedCount = Object.values(mapping).filter(Boolean).length;
    const totalSourceHeaders = sourceHeaders.length;
    const requiredFieldsCount = fieldDefs.filter(fd => fd.required).length;
    const requiredFieldsMapped = fieldDefs
        .filter(fd => fd.required)
        .filter(fd => Object.values(mapping).includes(fd.targetField)).length;
    // Base score from mapping coverage
    const coverageScore = mappedCount / totalSourceHeaders;
    // Bonus for mapping required fields
    const requiredFieldsScore = requiredFieldsCount > 0 ? requiredFieldsMapped / requiredFieldsCount : 1;
    // Combined score with weighting
    return coverageScore * 0.6 + requiredFieldsScore * 0.4;
}
//# sourceMappingURL=header-detector.js.map
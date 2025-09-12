export interface FieldDef {
    id: string;
    targetField: string;
    sourceHeaders: string[];
    transform?: string;
    required: boolean;
    defaultValue?: string;
}
export interface HeaderMatch {
    sourceHeader: string;
    targetField: string;
    confidence: number;
    fieldDef: FieldDef;
}
export interface AutoMappingResult {
    matches: HeaderMatch[];
    unmappedHeaders: string[];
    requiredFieldsMissing: string[];
    confidence: number;
}
/**
 * Auto-map source headers to target fields using field definitions
 */
export declare function autoMapHeaders(sourceHeaders: string[], fieldDefs: FieldDef[], confidenceThreshold?: number): AutoMappingResult;
/**
 * Suggest possible mappings for unmapped headers
 */
export declare function suggestMappings(unmappedHeaders: string[], fieldDefs: FieldDef[], usedTargetFields: Set<string>, threshold?: number): Array<{
    sourceHeader: string;
    suggestions: Array<{
        targetField: string;
        confidence: number;
        fieldDef: FieldDef;
    }>;
}>;
/**
 * Validate a manual mapping configuration
 */
export declare function validateMapping(mapping: Record<string, string>, // sourceHeader -> targetField
fieldDefs: FieldDef[]): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
};
/**
 * Generate confidence score for a complete mapping
 */
export declare function calculateMappingConfidence(mapping: Record<string, string>, sourceHeaders: string[], fieldDefs: FieldDef[]): number;
//# sourceMappingURL=header-detector.d.ts.map
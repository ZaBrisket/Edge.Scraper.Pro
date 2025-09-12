/**
 * Data transformation utilities for normalizing CSV/Excel data
 */
export type TransformFunction = (value: any) => any;
/**
 * Registry of available transforms
 */
export declare const transforms: Record<string, TransformFunction>;
/**
 * Apply a transform by name to a value
 */
export declare function applyTransform(transformName: string, value: any): any;
/**
 * Apply multiple transforms in sequence
 */
export declare function applyTransforms(transformNames: string[], value: any): any;
/**
 * Transform a row of data according to field definitions
 */
export declare function transformRow(row: Record<string, any>, mapping: Record<string, string>, // sourceHeader -> targetField
fieldDefs: Array<{
    targetField: string;
    transform?: string;
    defaultValue?: string;
}>): Record<string, any>;
/**
 * Validate transform names
 */
export declare function validateTransforms(transformNames: string[]): {
    valid: string[];
    invalid: string[];
};
/**
 * Get list of available transforms with descriptions
 */
export declare function getAvailableTransforms(): Array<{
    name: string;
    description: string;
    category: string;
}>;
//# sourceMappingURL=transforms.d.ts.map
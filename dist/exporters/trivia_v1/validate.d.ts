export interface ValidationOptions {
    strict?: boolean;
    verbose?: boolean;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Validate a trivia dataset against the schema
 */
export declare function validateTriviaDataset(data: any, options?: ValidationOptions): ValidationResult;
/**
 * Validate that all required fields are present and correctly typed
 */
export declare function validateRequiredFields(data: any): ValidationResult;
//# sourceMappingURL=validate.d.ts.map
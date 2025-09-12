/**
 * TypeScript wrapper for Supplier Directory Test Suite
 * Provides type definitions for the JavaScript implementation
 */
export interface TestResult {
    testName: string;
    passed: boolean;
    error?: string;
    duration: number;
    details?: any;
}
export interface TestSuiteResult {
    total: number;
    passed: number;
    failed: number;
    duration: number;
    results: TestResult[];
    summary: {
        successRate: number;
        averageDuration: number;
        failures: string[];
    };
}
export declare class SupplierDirectoryTestSuite {
    private options;
    constructor(options?: any);
    runAllTests(): Promise<TestSuiteResult>;
    runSingleTest(testName: string): Promise<TestResult>;
    runUrlTest(url: string): Promise<TestResult>;
}
//# sourceMappingURL=supplier-directory-test-suite.d.ts.map
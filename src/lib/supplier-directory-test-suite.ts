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

// Import the JavaScript implementation
// @ts-ignore - JavaScript module without types
const SupplierDirectoryTestSuiteJS = require('./supplier-directory-test-suite');

export class SupplierDirectoryTestSuite {
  private options: any;

  constructor(options: any = {}) {
    this.options = options;
  }

  async runAllTests(): Promise<TestSuiteResult> {
    // Create a new instance of the JavaScript test suite
    const testSuite = new SupplierDirectoryTestSuiteJS.SupplierDirectoryTestSuite(this.options);
    
    // Call the runAllTests method
    const result = await testSuite.runAllTests();
    
    return result;
  }

  // Delegate other methods to the JavaScript implementation
  async runSingleTest(testName: string): Promise<TestResult> {
    const testSuite = new SupplierDirectoryTestSuiteJS.SupplierDirectoryTestSuite(this.options);
    return await testSuite.runSingleTest(testName);
  }

  async runUrlTest(url: string): Promise<TestResult> {
    const testSuite = new SupplierDirectoryTestSuiteJS.SupplierDirectoryTestSuite(this.options);
    return await testSuite.runUrlTest(url);
  }
}
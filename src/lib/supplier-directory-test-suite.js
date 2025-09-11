/**
 * Test Suite for Supplier Directory Extractor
 * Tests extraction of company data from supplier directory pages
 */

const { JSDOM } = require('jsdom');
const { SupplierDirectoryExtractor } = require('./supplier-directory-extractor');

class SupplierDirectoryTestSuite {
  constructor() {
    this.extractor = new SupplierDirectoryExtractor();
    this.tests = [];
    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
      details: []
    };
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🧪 Starting Supplier Directory Extractor Test Suite\n');
    
    // Test cases
    this.addTest('Basic Table Extraction', () => this.testBasicTableExtraction());
    this.addTest('D2P Directory Format', () => this.testD2PDirectoryFormat());
    this.addTest('Alternative Layout', () => this.testAlternativeLayout());
    this.addTest('Empty Content', () => this.testEmptyContent());
    this.addTest('Malformed HTML', () => this.testMalformedHTML());
    this.addTest('Website Normalization', () => this.testWebsiteNormalization());
    this.addTest('Data Validation', () => this.testDataValidation());
    this.addTest('Deduplication', () => this.testDeduplication());
    
    // Run all tests
    for (const test of this.tests) {
      await this.runTest(test);
    }
    
    this.printResults();
    return this.results;
  }

  /**
   * Add a test case
   */
  addTest(name, testFunction) {
    this.tests.push({ name, testFunction });
  }

  /**
   * Run a single test
   */
  async runTest(test) {
    this.results.total++;
    console.log(`Running: ${test.name}...`);
    
    try {
      await test.testFunction();
      this.results.passed++;
      this.results.details.push({ name: test.name, status: 'PASSED' });
      console.log(`✅ ${test.name} - PASSED\n`);
    } catch (error) {
      this.results.failed++;
      this.results.details.push({ 
        name: test.name, 
        status: 'FAILED', 
        error: error.message 
      });
      console.log(`❌ ${test.name} - FAILED: ${error.message}\n`);
    }
  }

  /**
   * Test basic table extraction
   */
  async testBasicTableExtraction() {
    const html = `
      <html>
        <body>
          <div class="main-content">
            <table>
              <tr>
                <th>Company Name</th>
                <th>Contact Information</th>
                <th>Website</th>
              </tr>
              <tr>
                <td>ACME Manufacturing</td>
                <td>123 Main St, Anytown, ST 12345</td>
                <td>www.acme.com</td>
              </tr>
              <tr>
                <td>Best Corp Inc</td>
                <td>456 Oak Ave, Somewhere, ST 67890</td>
                <td>https://bestcorp.com</td>
              </tr>
            </table>
          </div>
        </body>
      </html>
    `;
    
    const dom = new JSDOM(html);
    const result = this.extractor.extractSupplierData(dom.window.document);
    
    if (result.companies.length !== 2) {
      throw new Error(`Expected 2 companies, got ${result.companies.length}`);
    }
    
    const company1 = result.companies[0];
    if (company1.name !== 'ACME Manufacturing') {
      throw new Error(`Expected 'ACME Manufacturing', got '${company1.name}'`);
    }
    
    if (!company1.contact.includes('123 Main St')) {
      throw new Error(`Expected contact info, got '${company1.contact}'`);
    }
    
    if (company1.website !== 'https://www.acme.com') {
      throw new Error(`Expected 'https://www.acme.com', got '${company1.website}'`);
    }
  }

  /**
   * Test D2P directory format (based on the provided screenshot)
   */
  async testD2PDirectoryFormat() {
    const html = `
      <html>
        <body>
          <div class="view-all-companies">
            <table>
              <tr>
                <td>ACCUMOLD</td>
                <td>1711 SE Oralabor Rd. Ankeny, IA 50021</td>
                <td>www.accu-mold.com</td>
              </tr>
              <tr>
                <td>ACCURATE COATING INC.</td>
                <td>955 Godfrey Ave. SW Grand Rapids, MI 49503</td>
                <td>www.accuratecoatinginc.com</td>
              </tr>
              <tr>
                <td>ACCURATE GASKET & STAMPING</td>
                <td>2780 S. Raritan St. Englewood, CO 80110</td>
                <td>www.accurategasket.com</td>
              </tr>
            </table>
          </div>
        </body>
      </html>
    `;
    
    const dom = new JSDOM(html);
    const result = this.extractor.extractSupplierData(dom.window.document, 'https://www.d2pbuyersguide.com');
    
    if (result.companies.length !== 3) {
      throw new Error(`Expected 3 companies, got ${result.companies.length}`);
    }
    
    const company1 = result.companies[0];
    if (company1.name !== 'ACCUMOLD') {
      throw new Error(`Expected 'ACCUMOLD', got '${company1.name}'`);
    }
    
    if (!company1.contact.includes('1711 SE Oralabor Rd')) {
      throw new Error(`Expected address, got '${company1.contact}'`);
    }
    
    if (company1.website !== 'https://www.accu-mold.com') {
      throw new Error(`Expected 'https://www.accu-mold.com', got '${company1.website}'`);
    }
    
    // Test validation
    if (!result.validation.isValid) {
      throw new Error(`Validation failed: ${result.validation.reasons.join(', ')}`);
    }
  }

  /**
   * Test alternative layout (non-table)
   */
  async testAlternativeLayout() {
    const html = `
      <html>
        <body>
          <div class="supplier-list">
            <div class="company-card">
              <h3 class="company-name">Tech Solutions LLC</h3>
              <div class="contact-info">789 Tech Blvd, Innovation City, IC 54321</div>
              <div class="website"><a href="https://techsolutions.com">Visit Website</a></div>
            </div>
            <div class="company-card">
              <h3 class="company-name">Industrial Works Inc</h3>
              <div class="contact-info">321 Industry Way, Factory Town, FT 98765</div>
              <div class="website"><a href="https://industrialworks.com">Website</a></div>
            </div>
          </div>
        </body>
      </html>
    `;
    
    const dom = new JSDOM(html);
    const result = this.extractor.extractSupplierData(dom.window.document);
    
    if (result.companies.length !== 2) {
      throw new Error(`Expected 2 companies, got ${result.companies.length}`);
    }
    
    const company1 = result.companies[0];
    if (company1.name !== 'Tech Solutions LLC') {
      throw new Error(`Expected 'Tech Solutions LLC', got '${company1.name}'`);
    }
    
    // The extractor should extract the href, not the text
    if (!company1.website.includes('techsolutions.com')) {
      throw new Error(`Expected website to contain 'techsolutions.com', got '${company1.website}'`);
    }
  }

  /**
   * Test empty content handling
   */
  async testEmptyContent() {
    const html = `
      <html>
        <body>
          <div class="main-content">
            <p>No companies found</p>
          </div>
        </body>
      </html>
    `;
    
    const dom = new JSDOM(html);
    const result = this.extractor.extractSupplierData(dom.window.document);
    
    if (result.companies.length !== 0) {
      throw new Error(`Expected 0 companies, got ${result.companies.length}`);
    }
    
    if (result.validation.isValid) {
      throw new Error('Expected validation to fail for empty content');
    }
  }

  /**
   * Test malformed HTML handling
   */
  async testMalformedHTML() {
    const html = `
      <html>
        <body>
          <div class="main-content">
            <table>
              <tr>
                <td>Company 1</td>
                <td>Address 1</td>
                <!-- Missing website column -->
              </tr>
              <tr>
                <!-- Missing name column -->
                <td>Address 2</td>
                <td>www.company2.com</td>
              </tr>
            </table>
          </div>
        </body>
      </html>
    `;
    
    const dom = new JSDOM(html);
    const result = this.extractor.extractSupplierData(dom.window.document);
    
    // Should still extract what it can
    if (result.companies.length === 0) {
      throw new Error('Expected to extract at least some data from malformed HTML');
    }
    
    // First company should have name and contact
    const company1 = result.companies[0];
    if (!company1.name || !company1.contact) {
      throw new Error('Expected to extract name and contact from first company');
    }
  }

  /**
   * Test website URL normalization
   */
  async testWebsiteNormalization() {
    const testCases = [
      { input: 'www.example.com', expected: 'https://www.example.com' },
      { input: 'example.com', expected: 'https://example.com' },
      { input: 'https://www.example.com', expected: 'https://www.example.com' },
      { input: 'http://example.com', expected: 'http://example.com' },
      { input: '  www.example.com  ', expected: 'https://www.example.com' }
    ];
    
    for (const testCase of testCases) {
      const normalized = this.extractor.normalizeWebsite(testCase.input);
      if (normalized !== testCase.expected) {
        throw new Error(`Expected '${testCase.expected}', got '${normalized}' for input '${testCase.input}'`);
      }
    }
  }

  /**
   * Test data validation
   */
  async testDataValidation() {
    const validCompanies = [
      { name: 'ACME Corp', contact: '123 Main St, City, ST 12345', website: 'https://acme.com' },
      { name: 'Best Inc', contact: '456 Oak Ave, Town, ST 67890', website: 'https://best.com' }
    ];
    
    const invalidCompanies = [
      { name: '', contact: '', website: '' },
      { name: '', contact: '', website: '' }
    ];
    
    const validResult = this.extractor.validateSupplierContent(validCompanies);
    if (!validResult.isValid) {
      throw new Error(`Valid companies should pass validation: ${validResult.reasons.join(', ')}`);
    }
    
    const invalidResult = this.extractor.validateSupplierContent(invalidCompanies);
    // Empty companies should fail validation
    if (invalidResult.isValid) {
      throw new Error('Empty companies should fail validation');
    }
  }

  /**
   * Test deduplication
   */
  async testDeduplication() {
    const duplicateCompanies = [
      { name: 'ACME Corp', contact: '123 Main St', website: 'https://acme.com' },
      { name: 'ACME Corp', contact: '123 Main St', website: 'https://acme.com' },
      { name: 'Best Inc', contact: '456 Oak Ave', website: 'https://best.com' },
      { name: 'acme corp', contact: '123 Main St', website: 'https://acme.com' }
    ];
    
    const deduplicated = this.extractor.deduplicateCompanies(duplicateCompanies);
    
    if (deduplicated.length !== 2) {
      throw new Error(`Expected 2 unique companies after deduplication, got ${deduplicated.length}`);
    }
    
    const names = deduplicated.map(c => c.name);
    if (!names.includes('ACME Corp') || !names.includes('Best Inc')) {
      throw new Error('Expected to keep one instance of each unique company');
    }
  }

  /**
   * Print test results
   */
  printResults() {
    console.log('📊 Test Results Summary');
    console.log('======================');
    console.log(`Total Tests: ${this.results.total}`);
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);
    console.log(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%\n`);
    
    if (this.results.failed > 0) {
      console.log('❌ Failed Tests:');
      this.results.details
        .filter(detail => detail.status === 'FAILED')
        .forEach(detail => {
          console.log(`  - ${detail.name}: ${detail.error}`);
        });
      console.log('');
    }
    
    if (this.results.passed === this.results.total) {
      console.log('🎉 All tests passed!');
    } else {
      console.log('⚠️  Some tests failed. Please review the issues above.');
    }
  }
}

// Export for use in other modules
module.exports = { SupplierDirectoryTestSuite };

// Run tests if this file is executed directly
if (require.main === module) {
  const testSuite = new SupplierDirectoryTestSuite();
  testSuite.runAllTests().catch(console.error);
}
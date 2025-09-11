/**
 * Demo script for supplier directory extraction
 * Shows how to use the enhanced scraping tools
 */

const { JSDOM } = require('jsdom');
const { SupplierDirectoryExtractor } = require('./src/lib/supplier-directory-extractor');
const { SupplierDataExporter } = require('./src/lib/supplier-export');

// Sample HTML that mimics the D2P supplier directory page
const sampleHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Design 2 Part Supplier Directory</title>
</head>
<body>
    <div class="view-all-companies">
        <h2>View All Companies</h2>
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
            <tr>
                <td>ACCURATE METAL FINISHING LLC</td>
                <td>414 South St. Randolph, MA 02368</td>
                <td>www.accuratemetalfinishing.com</td>
            </tr>
        </table>
    </div>
</body>
</html>
`;

async function runDemo() {
    console.log('🚀 Supplier Directory Extraction Demo\n');
    
    // Create DOM from HTML
    const dom = new JSDOM(sampleHTML);
    const document = dom.window.document;
    
    // Extract supplier data
    console.log('📊 Extracting company data...');
    const extractor = new SupplierDirectoryExtractor();
    const result = extractor.extractSupplierData(document, 'https://www.d2pbuyersguide.com');
    
    console.log(`✅ Found ${result.companies.length} companies`);
    console.log(`📈 Extraction score: ${result.score}`);
    console.log(`✅ Validation: ${result.validation.isValid ? 'PASSED' : 'FAILED'}\n`);
    
    // Display extracted companies
    console.log('🏢 Extracted Companies:');
    console.log('======================');
    result.companies.forEach((company, index) => {
        console.log(`${index + 1}. ${company.name}`);
        console.log(`   📍 ${company.contact}`);
        console.log(`   🌐 ${company.website}`);
        console.log('');
    });
    
    // Export to different formats
    console.log('📁 Exporting data...');
    const exporter = new SupplierDataExporter();
    
    // Export to JSON
    exporter.export(result.companies, 'demo-companies.json', { pretty: true });
    console.log('✅ Exported to demo-companies.json');
    
    // Export to CSV
    exporter.export(result.companies, 'demo-companies.csv');
    console.log('✅ Exported to demo-companies.csv');
    
    // Show validation details
    console.log('\n🔍 Validation Details:');
    console.log('=====================');
    Object.entries(result.validation.results).forEach(([rule, passed]) => {
        console.log(`${passed ? '✅' : '❌'} ${rule}: ${passed}`);
    });
    
    console.log('\n🎉 Demo completed successfully!');
    console.log('\nTo use with real websites:');
    console.log('1. Create a urls.txt file with supplier directory URLs');
    console.log('2. Run: node bin/edge-scraper scrape --urls urls.txt --mode supplier-directory --output results.json');
    console.log('3. Check the results.json and results-summary.json files');
}

runDemo().catch(console.error);
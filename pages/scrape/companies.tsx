/**
 * Supplier Directory (Companies) Scraping Page
 */

import React, { useState } from 'react';
import Layout from '../../components/Layout';
import JobRunner from '../../components/scrape/JobRunner';
import TabNavigation from '../../components/scrape/TabNavigation';

interface CompaniesOptions {
  enablePaginationDiscovery: boolean;
  enableUrlNormalization: boolean;
  extractionDepth: 'basic' | 'detailed';
  concurrency: number;
  delayMs: number;
}

export default function CompaniesScrapePage() {
  const [urls, setUrls] = useState('');
  const [options, setOptions] = useState<CompaniesOptions>({
    enablePaginationDiscovery: true,
    enableUrlNormalization: true,
    extractionDepth: 'basic',
    concurrency: 3,
    delayMs: 1000,
  });
  const [jobInput, setJobInput] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const urlList = urls
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0);

    if (urlList.length === 0) {
      alert('Please enter at least one URL');
      return;
    }

    if (urlList.length > 500) {
      alert('Maximum 500 URLs allowed for supplier directory mode');
      return;
    }

    setJobInput({
      urls: urlList,
      options,
    });
  };

  const handleJobComplete = (jobResult: any) => {
    setResult(jobResult);
  };

  const handleJobError = (error: string) => {
    alert(`Job failed: ${error}`);
    setJobInput(null);
  };

  const downloadResults = (format: 'json' | 'csv') => {
    if (!result) return;

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'json') {
      content = JSON.stringify(result, null, 2);
      filename = `companies-${Date.now()}.json`;
      mimeType = 'application/json';
    } else {
      // Convert to CSV - flatten company data
      const allCompanies: any[] = [];
      result.results?.forEach((r: any) => {
        if (r.success && r.data?.companies) {
          r.data.companies.forEach((company: any) => {
            allCompanies.push({
              sourceUrl: r.url,
              name: company.name || '',
              website: company.website || '',
              email: company.email || '',
              phone: company.phone || '',
              address: company.address || '',
              description: company.description || '',
              category: company.category || '',
              confidence: company.metadata?.confidence || '',
            });
          });
        }
      });

      const headers = ['Source URL', 'Company Name', 'Website', 'Email', 'Phone', 'Address', 'Description', 'Category', 'Confidence'];
      const rows = allCompanies.map(company => [
        company.sourceUrl,
        company.name,
        company.website,
        company.email,
        company.phone,
        company.address,
        company.description,
        company.category,
        company.confidence,
      ]);

      content = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      filename = `companies-${Date.now()}.csv`;
      mimeType = 'text/csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Layout title="Web Scraping - Company Web Pages">
      <div className="px-4 sm:px-6 lg:px-8">
        <TabNavigation />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Directory URLs</h3>
                
                <div>
                  <label htmlFor="urls" className="block text-sm font-medium text-gray-700">
                    URLs (one per line)
                  </label>
                  <textarea
                    id="urls"
                    rows={8}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono"
                    placeholder="https://www.d2pbuyersguide.com/filter/all/page/1&#10;https://directory.example.com/suppliers&#10;https://business-directory.com/companies"
                    value={urls}
                    onChange={(e) => setUrls(e.target.value)}
                    disabled={!!jobInput}
                  />
                  <p className="mt-2 text-sm text-gray-500">
                    Maximum 500 URLs. Estimated processing time: ~2s per URL
                  </p>
                </div>

                <div className="mt-6">
                  <h4 className="text-md font-medium text-gray-900 mb-3">Discovery Options</h4>
                  <div className="space-y-3">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600"
                        checked={options.enablePaginationDiscovery}
                        onChange={(e) => setOptions(prev => ({ ...prev, enablePaginationDiscovery: e.target.checked }))}
                        disabled={!!jobInput}
                      />
                      <span className="ml-2 text-sm text-gray-700">Enable pagination discovery</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600"
                        checked={options.enableUrlNormalization}
                        onChange={(e) => setOptions(prev => ({ ...prev, enableUrlNormalization: e.target.checked }))}
                        disabled={!!jobInput}
                      />
                      <span className="ml-2 text-sm text-gray-700">Enable URL normalization (HTTP→HTTPS, www variants)</span>
                    </label>
                  </div>
                </div>

                <div className="mt-6">
                  <label htmlFor="extractionDepth" className="block text-sm font-medium text-gray-700">
                    Extraction depth
                  </label>
                  <select
                    id="extractionDepth"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    value={options.extractionDepth}
                    onChange={(e) => setOptions(prev => ({ ...prev, extractionDepth: e.target.value as any }))}
                    disabled={!!jobInput}
                  >
                    <option value="basic">Basic (name, website, contact info)</option>
                    <option value="detailed">Detailed (includes descriptions, categories)</option>
                  </select>
                </div>

                <div className="mt-6">
                  <h4 className="text-md font-medium text-gray-900 mb-3">Performance Settings</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="concurrency" className="block text-sm font-medium text-gray-700">
                        Concurrent requests
                      </label>
                      <input
                        type="number"
                        id="concurrency"
                        min="1"
                        max="20"
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        value={options.concurrency}
                        onChange={(e) => setOptions(prev => ({ ...prev, concurrency: parseInt(e.target.value) }))}
                        disabled={!!jobInput}
                      />
                    </div>
                    <div>
                      <label htmlFor="delayMs" className="block text-sm font-medium text-gray-700">
                        Delay between requests (ms)
                      </label>
                      <input
                        type="number"
                        id="delayMs"
                        min="0"
                        max="10000"
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        value={options.delayMs}
                        onChange={(e) => setOptions(prev => ({ ...prev, delayMs: parseInt(e.target.value) }))}
                        disabled={!!jobInput}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    type="submit"
                    disabled={!!jobInput}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Start Extraction
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="lg:col-span-1">
            {jobInput && (
              <JobRunner
                mode="supplier-directory"
                input={jobInput}
                onComplete={handleJobComplete}
                onError={handleJobError}
              />
            )}

            {result && (
              <div className="mt-6 bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Results</h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total URLs:</span>
                    <span className="font-medium">{result.summary?.total || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Companies Found:</span>
                    <span className="font-medium text-green-600">
                      {result.results?.reduce((total: number, r: any) => {
                        return total + (r.success && r.data?.companies ? r.data.companies.length : 0);
                      }, 0) || 0}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Failed URLs:</span>
                    <span className="font-medium text-red-600">{result.summary?.failed || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Pages Discovered:</span>
                    <span className="font-medium text-blue-600">
                      {result.results?.reduce((total: number, r: any) => {
                        return total + (r.paginationDiscovered ? 1 : 0);
                      }, 0) || 0}
                    </span>
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  <button
                    onClick={() => downloadResults('json')}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Download JSON
                  </button>
                  <button
                    onClick={() => downloadResults('csv')}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Download CSV
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
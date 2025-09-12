/**
 * Companies Scraping Page
 */

import React, { useState } from 'react';
import Layout from '../../components/Layout';
import TabNavigation from '../../components/scrape/TabNavigation';
import TaskForm from '../../components/scrape/TaskForm';
import TaskRunner from '../../components/scrape/TaskRunner';
import TaskResults from '../../components/scrape/TaskResults';

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

  const handleSubmit = (data: any) => {
    const urlList = urls
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0);

    if (urlList.length === 0) {
      alert('Please enter at least one URL');
      return;
    }

    if (urlList.length > 500) {
      alert('Maximum 500 URLs allowed for companies mode');
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
      // Convert to CSV
      const companies = result.companies || [];
      const headers = ['URL', 'Name', 'Website', 'Email', 'Phone', 'Address', 'Description'];
      const rows = companies.map((company: any) => [
        company.url,
        company.name || '',
        company.website || '',
        company.email || '',
        company.phone || '',
        company.address || '',
        company.description || '',
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
    <Layout title="Web Scraping - Companies">
      <div className="px-4 sm:px-6 lg:px-8">
        <TabNavigation />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Input Form */}
          <div className="lg:col-span-2">
            <TaskForm
              taskName="companies"
              onSubmit={handleSubmit}
              isSubmitting={!!jobInput}
            >
              <div>
                <label htmlFor="urls" className="block text-sm font-medium text-gray-700">
                  Directory URLs (one per line)
                </label>
                <textarea
                  id="urls"
                  rows={10}
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

              {/* Extraction Options */}
              <div className="mt-6">
                <h4 className="text-md font-medium text-gray-900 mb-3">Extraction Options</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                        checked={options.enablePaginationDiscovery}
                        onChange={(e) => setOptions(prev => ({ ...prev, enablePaginationDiscovery: e.target.checked }))}
                        disabled={!!jobInput}
                      />
                      <span className="ml-2 text-sm text-gray-700">Enable pagination discovery</span>
                    </label>
                  </div>
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                        checked={options.enableUrlNormalization}
                        onChange={(e) => setOptions(prev => ({ ...prev, enableUrlNormalization: e.target.checked }))}
                        disabled={!!jobInput}
                      />
                      <span className="ml-2 text-sm text-gray-700">Enable URL normalization</span>
                    </label>
                  </div>
                </div>

                <div className="mt-3">
                  <label htmlFor="extractionDepth" className="block text-sm font-medium text-gray-700">
                    Extraction Depth
                  </label>
                  <select
                    id="extractionDepth"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    value={options.extractionDepth}
                    onChange={(e) => setOptions(prev => ({ ...prev, extractionDepth: e.target.value as any }))}
                    disabled={!!jobInput}
                  >
                    <option value="basic">Basic (company name, contact info)</option>
                    <option value="detailed">Detailed (full company profile)</option>
                  </select>
                </div>
              </div>

              {/* Performance Options */}
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
            </TaskForm>
          </div>

          {/* Job Status & Results */}
          <div className="lg:col-span-1">
            {jobInput && (
              <TaskRunner
                taskName="companies"
                input={jobInput}
                onComplete={handleJobComplete}
                onError={handleJobError}
              />
            )}

            {result && (
              <TaskResults
                result={result}
                taskName="companies"
                onDownload={downloadResults}
              />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
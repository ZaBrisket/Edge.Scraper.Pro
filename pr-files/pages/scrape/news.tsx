/**
 * News Articles Scraping Page
 */

import React, { useState } from 'react';
import Layout from '../../components/Layout';
import JobRunner from '../../components/scrape/JobRunner';

interface NewsOptions {
  extractContent: boolean;
  extractImages: boolean;
  maxContentLength: number;
  dateFormat: 'iso' | 'timestamp' | 'human';
  concurrency: number;
  delayMs: number;
}

export default function NewsScrapePage() {
  const [urls, setUrls] = useState('');
  const [options, setOptions] = useState<NewsOptions>({
    extractContent: false,
    extractImages: false,
    maxContentLength: 5000,
    dateFormat: 'iso',
    concurrency: 5,
    delayMs: 500,
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

    if (urlList.length > 1000) {
      alert('Maximum 1000 URLs allowed for news articles mode');
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
      filename = `news-articles-${Date.now()}.json`;
      mimeType = 'application/json';
    } else {
      // Convert to CSV
      const articles = result.results?.filter((r: any) => r.success && r.data) || [];
      const headers = ['URL', 'Title', 'Author', 'Publish Date', 'Excerpt', 'Word Count', 'Category'];
      const rows = articles.map((article: any) => [
        article.url,
        article.data.title || '',
        article.data.author || article.data.byline || '',
        article.data.publishDate || '',
        article.data.excerpt || '',
        article.data.wordCount || '',
        article.data.category || '',
      ]);

      content = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      filename = `news-articles-${Date.now()}.csv`;
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
    <Layout title="News Articles Scraping">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-2xl">📰</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  News Articles Mode
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>
                    Extract article metadata, content, and structured data from news article URLs.
                    Supports major news sites and automatically detects titles, authors, publication dates, and content.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Input Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Article URLs</h3>
                
                <div>
                  <label htmlFor="urls" className="block text-sm font-medium text-gray-700">
                    URLs (one per line)
                  </label>
                  <textarea
                    id="urls"
                    rows={10}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono"
                    placeholder="https://www.bbc.com/news/world-12345678&#10;https://www.cnn.com/2024/01/15/politics/news-story/&#10;https://www.reuters.com/world/article-title-2024-01-15/"
                    value={urls}
                    onChange={(e) => setUrls(e.target.value)}
                    disabled={!!jobInput}
                  />
                  <p className="mt-2 text-sm text-gray-500">
                    Maximum 1,000 URLs. Estimated processing time: ~1.5s per URL
                  </p>
                </div>

                {/* Advanced Options */}
                <div className="mt-6">
                  <h4 className="text-md font-medium text-gray-900 mb-3">Extraction Options</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          checked={options.extractContent}
                          onChange={(e) => setOptions(prev => ({ ...prev, extractContent: e.target.checked }))}
                          disabled={!!jobInput}
                        />
                        <span className="ml-2 text-sm text-gray-700">Extract full content</span>
                      </label>
                    </div>
                    <div>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          checked={options.extractImages}
                          onChange={(e) => setOptions(prev => ({ ...prev, extractImages: e.target.checked }))}
                          disabled={!!jobInput}
                        />
                        <span className="ml-2 text-sm text-gray-700">Extract images</span>
                      </label>
                    </div>
                  </div>

                  {options.extractContent && (
                    <div className="mt-3">
                      <label htmlFor="maxContentLength" className="block text-sm font-medium text-gray-700">
                        Max content length (characters)
                      </label>
                      <input
                        type="number"
                        id="maxContentLength"
                        min="100"
                        max="50000"
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        value={options.maxContentLength}
                        onChange={(e) => setOptions(prev => ({ ...prev, maxContentLength: parseInt(e.target.value) }))}
                        disabled={!!jobInput}
                      />
                    </div>
                  )}

                  <div className="mt-3">
                    <label htmlFor="dateFormat" className="block text-sm font-medium text-gray-700">
                      Date format
                    </label>
                    <select
                      id="dateFormat"
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      value={options.dateFormat}
                      onChange={(e) => setOptions(prev => ({ ...prev, dateFormat: e.target.value as any }))}
                      disabled={!!jobInput}
                    >
                      <option value="iso">ISO 8601 (2024-01-15T10:30:00Z)</option>
                      <option value="timestamp">Unix timestamp (1705312200)</option>
                      <option value="human">Human readable (January 15, 2024)</option>
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

          {/* Job Status & Results */}
          <div className="lg:col-span-1">
            {jobInput && (
              <JobRunner
                mode="news-articles"
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
                    <span className="text-gray-500">Successful:</span>
                    <span className="font-medium text-green-600">{result.summary?.successful || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Failed:</span>
                    <span className="font-medium text-red-600">{result.summary?.failed || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Avg. Time:</span>
                    <span className="font-medium">{Math.round(result.summary?.averageTime || 0)}ms</span>
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  <button
                    onClick={() => downloadResults('json')}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download JSON
                  </button>
                  <button
                    onClick={() => downloadResults('csv')}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
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
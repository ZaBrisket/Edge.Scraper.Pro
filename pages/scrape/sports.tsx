/**
 * Sports Statistics Scraping Page
 */

import React, { useState } from 'react';
import Layout from '../../components/Layout';
import JobRunner from '../../components/scrape/JobRunner';

interface SportsOptions {
  extractTables: boolean;
  extractBiography: boolean;
  extractAchievements: boolean;
  sportsSite: 'auto' | 'pro-football-reference' | 'basketball-reference' | 'baseball-reference' | 'hockey-reference';
  concurrency: number;
  delayMs: number;
}

export default function SportsScrapePage() {
  const [urls, setUrls] = useState('');
  const [options, setOptions] = useState<SportsOptions>({
    extractTables: true,
    extractBiography: true,
    extractAchievements: true,
    sportsSite: 'auto',
    concurrency: 2,
    delayMs: 2000,
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

    if (urlList.length > 200) {
      alert('Maximum 200 URLs allowed for sports mode');
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
      filename = `sports-stats-${Date.now()}.json`;
      mimeType = 'application/json';
    } else {
      // Convert to CSV
      const players = result.results?.filter((r: any) => r.success && r.data) || [];
      const headers = ['URL', 'Player Name', 'Position', 'Team', 'Confidence', 'Site'];
      const rows = players.map((player: any) => [
        player.url,
        player.data.playerName || '',
        player.data.position || '',
        player.data.team || '',
        player.data.metadata?.confidence || '',
        player.data.metadata?.site || '',
      ]);

      content = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      filename = `sports-stats-${Date.now()}.csv`;
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
    <Layout title="Sports Statistics Scraping">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="bg-orange-50 border border-orange-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-2xl">🏈</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-orange-800">
                  Sports Statistics Mode
                </h3>
                <div className="mt-2 text-sm text-orange-700">
                  <p>
                    Extract player statistics, biographical data, and achievements from Pro Football Reference 
                    and other sports reference sites. Optimized for sports data with respectful rate limiting.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Player URLs</h3>
                
                <div>
                  <label htmlFor="urls" className="block text-sm font-medium text-gray-700">
                    URLs (one per line)
                  </label>
                  <textarea
                    id="urls"
                    rows={8}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono"
                    placeholder="https://www.pro-football-reference.com/players/M/MahoPa00.htm&#10;https://www.basketball-reference.com/players/j/jamesle01.html"
                    value={urls}
                    onChange={(e) => setUrls(e.target.value)}
                    disabled={!!jobInput}
                  />
                  <p className="mt-2 text-sm text-gray-500">
                    Maximum 200 URLs. Estimated processing time: ~3s per URL
                  </p>
                </div>

                <div className="mt-6">
                  <h4 className="text-md font-medium text-gray-900 mb-3">Extraction Options</h4>
                  <div className="space-y-3">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600"
                        checked={options.extractTables}
                        onChange={(e) => setOptions(prev => ({ ...prev, extractTables: e.target.checked }))}
                        disabled={!!jobInput}
                      />
                      <span className="ml-2 text-sm text-gray-700">Extract statistics tables</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600"
                        checked={options.extractBiography}
                        onChange={(e) => setOptions(prev => ({ ...prev, extractBiography: e.target.checked }))}
                        disabled={!!jobInput}
                      />
                      <span className="ml-2 text-sm text-gray-700">Extract biographical data</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600"
                        checked={options.extractAchievements}
                        onChange={(e) => setOptions(prev => ({ ...prev, extractAchievements: e.target.checked }))}
                        disabled={!!jobInput}
                      />
                      <span className="ml-2 text-sm text-gray-700">Extract achievements & awards</span>
                    </label>
                  </div>
                </div>

                <div className="mt-6">
                  <h4 className="text-md font-medium text-gray-900 mb-3">Performance Settings</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="concurrency" className="block text-sm font-medium text-gray-700">
                        Concurrent requests (max 5)
                      </label>
                      <input
                        type="number"
                        id="concurrency"
                        min="1"
                        max="5"
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        value={options.concurrency}
                        onChange={(e) => setOptions(prev => ({ ...prev, concurrency: parseInt(e.target.value) }))}
                        disabled={!!jobInput}
                      />
                    </div>
                    <div>
                      <label htmlFor="delayMs" className="block text-sm font-medium text-gray-700">
                        Delay between requests (ms, min 1000)
                      </label>
                      <input
                        type="number"
                        id="delayMs"
                        min="1000"
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
                mode="sports"
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
                    <span className="text-gray-500">Players Found:</span>
                    <span className="font-medium text-green-600">
                      {result.results?.filter((r: any) => r.success && r.data?.playerName).length || 0}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Failed:</span>
                    <span className="font-medium text-red-600">{result.summary?.failed || 0}</span>
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
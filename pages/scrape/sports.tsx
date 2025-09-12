/**
 * Sports Scraping Page
 */

import React, { useState } from 'react';
import Layout from '../../components/Layout';
import TabNavigation from '../../components/scrape/TabNavigation';
import TaskForm from '../../components/scrape/TaskForm';
import TaskRunner from '../../components/scrape/TaskRunner';
import TaskResults from '../../components/scrape/TaskResults';

interface SportsOptions {
  extractTables: boolean;
  extractBiography: boolean;
  extractAchievements: boolean;
  includePlaceholderData: boolean;
  sportsSite: 'pro-football-reference' | 'basketball-reference' | 'baseball-reference' | 'hockey-reference' | 'auto';
  concurrency: number;
  delayMs: number;
}

export default function SportsScrapePage() {
  const [urls, setUrls] = useState('');
  const [options, setOptions] = useState<SportsOptions>({
    extractTables: true,
    extractBiography: true,
    extractAchievements: true,
    includePlaceholderData: false,
    sportsSite: 'auto',
    concurrency: 2,
    delayMs: 2000,
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
      filename = `sports-players-${Date.now()}.json`;
      mimeType = 'application/json';
    } else {
      // Convert to CSV
      const players = result.players || [];
      const headers = ['URL', 'Name', 'Position', 'Team', 'Site'];
      const rows = players.map((player: any) => [
        player.url,
        player.name || '',
        player.position || '',
        player.team || '',
        player.metadata?.site || '',
      ]);

      content = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      filename = `sports-players-${Date.now()}.csv`;
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
    <Layout title="Web Scraping - Sports">
      <div className="px-4 sm:px-6 lg:px-8">
        <TabNavigation />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Input Form */}
          <div className="lg:col-span-2">
            <TaskForm
              taskName="sports"
              onSubmit={handleSubmit}
              isSubmitting={!!jobInput}
            >
              <div>
                <label htmlFor="urls" className="block text-sm font-medium text-gray-700">
                  Player URLs (one per line)
                </label>
                <textarea
                  id="urls"
                  rows={10}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono"
                  placeholder="https://www.pro-football-reference.com/players/M/MahoPa00.htm&#10;https://www.basketball-reference.com/players/j/jamesle01.html&#10;https://www.baseball-reference.com/players/t/troutmi01.shtml"
                  value={urls}
                  onChange={(e) => setUrls(e.target.value)}
                  disabled={!!jobInput}
                />
                <p className="mt-2 text-sm text-gray-500">
                  Maximum 200 URLs. Estimated processing time: ~3s per URL
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
                        checked={options.extractTables}
                        onChange={(e) => setOptions(prev => ({ ...prev, extractTables: e.target.checked }))}
                        disabled={!!jobInput}
                      />
                      <span className="ml-2 text-sm text-gray-700">Extract statistics tables</span>
                    </label>
                  </div>
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                        checked={options.extractBiography}
                        onChange={(e) => setOptions(prev => ({ ...prev, extractBiography: e.target.checked }))}
                        disabled={!!jobInput}
                      />
                      <span className="ml-2 text-sm text-gray-700">Extract biographical data</span>
                    </label>
                  </div>
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                        checked={options.extractAchievements}
                        onChange={(e) => setOptions(prev => ({ ...prev, extractAchievements: e.target.checked }))}
                        disabled={!!jobInput}
                      />
                      <span className="ml-2 text-sm text-gray-700">Extract achievements</span>
                    </label>
                  </div>
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                        checked={options.includePlaceholderData}
                        onChange={(e) => setOptions(prev => ({ ...prev, includePlaceholderData: e.target.checked }))}
                        disabled={!!jobInput}
                      />
                      <span className="ml-2 text-sm text-gray-700">Include placeholder data</span>
                    </label>
                  </div>
                </div>

                <div className="mt-3">
                  <label htmlFor="sportsSite" className="block text-sm font-medium text-gray-700">
                    Sports Site
                  </label>
                  <select
                    id="sportsSite"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    value={options.sportsSite}
                    onChange={(e) => setOptions(prev => ({ ...prev, sportsSite: e.target.value as any }))}
                    disabled={!!jobInput}
                  >
                    <option value="auto">Auto-detect</option>
                    <option value="pro-football-reference">Pro Football Reference</option>
                    <option value="basketball-reference">Basketball Reference</option>
                    <option value="baseball-reference">Baseball Reference</option>
                    <option value="hockey-reference">Hockey Reference</option>
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
                      max="5"
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
            </TaskForm>
          </div>

          {/* Job Status & Results */}
          <div className="lg:col-span-1">
            {jobInput && (
              <TaskRunner
                taskName="sports"
                input={jobInput}
                onComplete={handleJobComplete}
                onError={handleJobError}
              />
            )}

            {result && (
              <TaskResults
                result={result}
                taskName="sports"
                onDownload={downloadResults}
              />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
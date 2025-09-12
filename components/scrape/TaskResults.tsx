/**
 * Generic Task Results Component
 * Displays results and provides download functionality
 */

import React from 'react';

export interface TaskResultsProps {
  result: any;
  taskName: string;
  onDownload: (format: 'json' | 'csv') => void;
}

export default function TaskResults({ result, taskName, onDownload }: TaskResultsProps) {
  if (!result) return null;

  const getItemCount = () => {
    if (result.articles) return result.articles.length;
    if (result.players) return result.players.length;
    if (result.companies) return result.companies.length;
    return 0;
  };

  const getItemName = () => {
    if (result.articles) return 'Articles';
    if (result.players) return 'Players';
    if (result.companies) return 'Companies';
    return 'Items';
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
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
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">{getItemName()} Extracted:</span>
          <span className="font-medium">{getItemCount()}</span>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <button
          onClick={() => onDownload('json')}
          className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download JSON
        </button>
        <button
          onClick={() => onDownload('csv')}
          className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download CSV
        </button>
      </div>
    </div>
  );
}
/**
 * Mode Selector Component
 * Displays available scraping modes with descriptions and examples
 */

import React from 'react';
import Link from 'next/link';

interface Mode {
  id: string;
  label: string;
  description: string;
  icon: string;
  estimatedTime: string;
  maxBatch: number;
  examples: string[];
  href: string;
}

const modes: Mode[] = [
  {
    id: 'news-articles',
    label: 'News Articles',
    description: 'Extract article metadata, content, and structured data from news article URLs',
    icon: '📰',
    estimatedTime: '~1.5s per URL',
    maxBatch: 1000,
    examples: [
      'https://www.bbc.com/news/world-12345678',
      'https://www.cnn.com/2024/01/15/politics/news-story/',
      'https://www.reuters.com/world/article-title-2024-01-15/',
    ],
    href: '/scrape/news',
  },
  {
    id: 'sports',
    label: 'Sports Statistics',
    description:
      'Extract player statistics, biographical data, and achievements from sports reference sites',
    icon: '🏈',
    estimatedTime: '~3s per URL',
    maxBatch: 200,
    examples: [
      'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
      'https://www.basketball-reference.com/players/j/jamesle01.html',
      'https://www.baseball-reference.com/players/t/troutmi01.shtml',
    ],
    href: '/scrape/sports',
  },
  {
    id: 'supplier-directory',
    label: 'Supplier Directory',
    description: 'Extract company listings and contact information from supplier directory pages',
    icon: '🏢',
    estimatedTime: '~2s per URL',
    maxBatch: 500,
    examples: [
      'https://www.d2pbuyersguide.com/filter/all/page/1',
      'https://directory.example.com/suppliers',
      'https://business-directory.com/companies',
    ],
    href: '/scrape/companies',
  },
];

export default function ModeSelector() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Choose Your Scraping Mode</h2>
        <p className="mt-2 text-gray-600">
          Select the extraction mode that best fits your data source
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {modes.map(mode => (
          <Link
            key={mode.id}
            href={mode.href}
            className="group relative rounded-lg p-6 bg-white shadow hover:shadow-md transition-shadow border border-gray-200 hover:border-blue-300"
          >
            <div>
              <span className="text-4xl mb-4 block">{mode.icon}</span>
              <h3 className="text-lg font-medium text-gray-900 group-hover:text-blue-600">
                {mode.label}
              </h3>
              <p className="mt-2 text-sm text-gray-500">{mode.description}</p>

              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Speed: {mode.estimatedTime}</span>
                  <span>Max: {mode.maxBatch.toLocaleString()} URLs</span>
                </div>

                <div className="text-xs text-gray-400">
                  <div className="font-medium mb-1">Example URLs:</div>
                  <div className="space-y-1">
                    {mode.examples.slice(0, 2).map((example, idx) => (
                      <div key={idx} className="truncate font-mono bg-gray-50 px-2 py-1 rounded">
                        {example}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Select Mode →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Need help choosing a mode?</h3>
            <div className="mt-2 text-sm text-blue-700">
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>News Articles:</strong> Best for extracting article content, titles,
                  authors, and publication dates
                </li>
                <li>
                  <strong>Sports Statistics:</strong> Specialized for Pro Football Reference and
                  similar sports sites
                </li>
                <li>
                  <strong>Supplier Directory:</strong> Optimized for business directories with
                  pagination support
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

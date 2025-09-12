/**
 * Mode Help Drawer Component
 * 
 * Provides guidance on accepted URL patterns and expected outputs
 * for each scraping mode (News, Sports, Companies)
 */

import React, { useState } from 'react';

interface ModeHelpProps {
  mode: 'news' | 'sports' | 'companies';
}

const modeInfo = {
  news: {
    title: 'News Articles Mode',
    description: 'Extract content from news articles and blog posts',
    urlPatterns: [
      'https://www.bbc.com/news/world-12345678',
      'https://www.cnn.com/2024/01/15/politics/news-story/',
      'https://www.reuters.com/world/article-title-2024-01-15/',
      'https://news.ycombinator.com/item?id=12345678',
      'https://www.reddit.com/r/technology/comments/abc123/',
    ],
    expectedOutputs: [
      'Article title and content',
      'Author and publication date',
      'Article metadata (description, keywords)',
      'Images and media links',
      'Article tags and categories',
    ],
    tips: [
      'Works best with major news sites and blogs',
      'Auto-detects article content using multiple selectors',
      'Supports both traditional news sites and social platforms',
      'Can extract full article text or just summaries',
    ],
  },
  sports: {
    title: 'Sports Content Mode',
    description: 'Extract player statistics, team data, and sports information',
    urlPatterns: [
      'https://www.pro-football-reference.com/players/M/MahoPa00.htm',
      'https://www.basketball-reference.com/players/j/jamesle01.html',
      'https://www.baseball-reference.com/players/t/troutmi01.shtml',
      'https://www.espn.com/nfl/player/_/id/12345/player-name',
      'https://www.nfl.com/players/player-name/',
    ],
    expectedOutputs: [
      'Player statistics and career data',
      'Team information and roster details',
      'Game results and scores',
      'Player biographical information',
      'Achievements and awards',
    ],
    tips: [
      'Optimized for sports reference sites',
      'Extracts structured data from tables',
      'Supports multiple sports (football, basketball, baseball, etc.)',
      'Can auto-detect sport type from URL patterns',
    ],
  },
  companies: {
    title: 'Companies Mode',
    description: 'Extract company profiles and business information',
    urlPatterns: [
      'https://www.linkedin.com/company/example-corp',
      'https://www.crunchbase.com/organization/example',
      'https://www.glassdoor.com/Overview/Working-at-Example-Corp.htm',
      'https://www.example.com/about',
      'https://directory.example.com/company/123',
    ],
    expectedOutputs: [
      'Company name and description',
      'Contact information (email, phone, address)',
      'Industry and company size',
      'Services and products offered',
      'Social media links and website',
      'Team and leadership information',
    ],
    tips: [
      'Works with company websites and business directories',
      'Supports pagination discovery for directory sites',
      'Can extract detailed company profiles',
      'Includes URL normalization for better success rates',
    ],
  },
};

export default function ModeHelp({ mode }: ModeHelpProps) {
  const [isOpen, setIsOpen] = useState(false);
  const info = modeInfo[mode];

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        onClick={() => setIsOpen(true)}
      >
        <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Mode Help
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setIsOpen(false)} />

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      {info.title}
                    </h3>
                    
                    <p className="text-sm text-gray-600 mb-6">
                      {info.description}
                    </p>

                    <div className="space-y-6">
                      {/* URL Patterns */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-3">Accepted URL Patterns</h4>
                        <div className="bg-gray-50 rounded-md p-3">
                          <ul className="space-y-2">
                            {info.urlPatterns.map((pattern, index) => (
                              <li key={index} className="text-sm font-mono text-gray-700">
                                {pattern}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Expected Outputs */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-3">Expected Outputs</h4>
                        <ul className="space-y-1">
                          {info.expectedOutputs.map((output, index) => (
                            <li key={index} className="text-sm text-gray-600 flex items-start">
                              <svg className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              {output}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Tips */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-3">Tips & Best Practices</h4>
                        <ul className="space-y-1">
                          {info.tips.map((tip, index) => (
                            <li key={index} className="text-sm text-gray-600 flex items-start">
                              <svg className="h-4 w-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => setIsOpen(false)}
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
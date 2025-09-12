/**
 * Tab Navigation Component for Scraping Modes
 * Provides tabbed interface to switch between different scraping modes
 */

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

interface Tab {
  id: string;
  label: string;
  description: string;
  icon: string;
  href: string;
  color: string;
}

const tabs: Tab[] = [
  {
    id: 'news-articles',
    label: 'News Articles & Press Releases',
    description: 'Extract article metadata, content, and structured data from news URLs',
    icon: '📰',
    href: '/scrape/news',
    color: 'blue',
  },
  {
    id: 'sports',
    label: 'Sports Data',
    description: 'Extract player statistics, biographical data, and achievements',
    icon: '🏈',
    href: '/scrape/sports',
    color: 'orange',
  },
  {
    id: 'companies',
    label: 'Company Web Pages',
    description: 'Extract company listings and contact information from directories',
    icon: '🏢',
    href: '/scrape/companies',
    color: 'green',
  },
];

export default function TabNavigation() {
  const router = useRouter();
  const currentPath = router.asPath;

  const getTabClasses = (tab: Tab, isActive: boolean) => {
    const baseClasses = "group relative min-w-0 flex-1 overflow-hidden py-4 px-6 text-center text-sm font-medium hover:bg-gray-50 focus:z-10 border-b-2 transition-colors";
    
    if (isActive) {
      const colorClasses = {
        blue: "border-blue-500 text-blue-600 bg-blue-50",
        orange: "border-orange-500 text-orange-600 bg-orange-50", 
        green: "border-green-500 text-green-600 bg-green-50",
      };
      return `${baseClasses} ${colorClasses[tab.color as keyof typeof colorClasses]}`;
    }
    
    return `${baseClasses} border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700`;
  };

  return (
    <div className="mb-8">
      {/* Tab Headers */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-0" aria-label="Tabs">
          {tabs.map((tab) => {
            const isActive = currentPath === tab.href || 
              (currentPath === '/scrape' && tab.id === 'news-articles');
            
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={getTabClasses(tab, isActive)}
              >
                <div className="flex flex-col items-center space-y-2">
                  <span className="text-2xl">{tab.icon}</span>
                  <span className="font-semibold">{tab.label}</span>
                  <span className="text-xs text-gray-500 hidden sm:block">
                    {tab.description}
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Help Section */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-gray-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-gray-800">
              Choose Your Scraping Mode
            </h3>
            <div className="mt-2 text-sm text-gray-600">
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>News Articles & Press Releases:</strong> Best for extracting article content, titles, authors, and publication dates from news sites
                </li>
                <li>
                  <strong>Sports Data:</strong> Specialized for Pro Football Reference and similar sports statistics sites
                </li>
                <li>
                  <strong>Company Web Pages:</strong> Optimized for business directories and supplier listings with pagination support
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
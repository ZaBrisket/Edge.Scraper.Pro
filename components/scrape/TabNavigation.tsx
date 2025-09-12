/**
 * Tab Navigation Component
 * Top navigation tabs for different scraping tasks
 */

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const tabs = [
  { id: 'news', label: 'News', href: '/scrape/news' },
  { id: 'sports', label: 'Sports', href: '/scrape/sports' },
  { id: 'companies', label: 'Companies', href: '/scrape/companies' },
];

export default function TabNavigation() {
  const router = useRouter();
  const currentPath = router.pathname;

  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex space-x-8" aria-label="Tabs">
        {tabs.map(tab => {
          const isActive = currentPath === tab.href;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`
                whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm
                ${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

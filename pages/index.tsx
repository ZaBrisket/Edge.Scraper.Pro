/**
 * Main Landing Page
 * Redirects to the scrape section where the tabs are located
 */

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the scrape section with tabs
    router.replace('/scrape/news');
  }, [router]);

  return (
    <Layout title="EdgeScraperPro">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            EdgeScraperPro - Advanced Web Scraping Platform
          </h2>
          <p className="text-gray-600 mb-4">
            Loading scraping interface...
          </p>
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
        </div>
      </div>
    </Layout>
  );
}

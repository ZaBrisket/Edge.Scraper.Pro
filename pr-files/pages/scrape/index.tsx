/**
 * Scrape Dashboard Page
 * Mode selection and overview
 */

import React from 'react';
import Layout from '../../components/Layout';
import ModeSelector from '../../components/scrape/ModeSelector';

export default function ScrapePage() {
  return (
    <Layout title="Web Scraping">
      <div className="px-4 sm:px-6 lg:px-8">
        <ModeSelector />
      </div>
    </Layout>
  );
}
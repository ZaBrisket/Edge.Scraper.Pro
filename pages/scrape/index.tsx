/**
 * Scrape Dashboard Page
 * Mode selection and overview
 */

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function ScrapePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to news articles as the default tab
    router.replace('/scrape/news');
  }, [router]);

  return null;
}
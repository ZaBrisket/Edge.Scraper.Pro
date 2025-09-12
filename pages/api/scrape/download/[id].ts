/**
 * Download Job Results API Endpoint
 * GET /api/scrape/download/[id]?format=json|csv
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createLogger } from '../../../../src/lib/logger';

const logger = createLogger('api-scrape-download');

// Import jobs from start.ts (in production, use shared storage)
let jobs: Map<string, any>;
try {
  const startModule = require('../start');
  jobs = startModule.jobs;
} catch (error) {
  // Initialize empty jobs map if start.ts hasn't been loaded
  jobs = new Map();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id, format = 'json' } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    if (format !== 'json' && format !== 'csv') {
      return res.status(400).json({ error: 'Format must be json or csv' });
    }

    const job = jobs.get(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed' || !job.result) {
      return res.status(400).json({
        error: 'Job is not completed or has no results',
      });
    }

    logger.info('Download requested', {
      jobId: id,
      format,
      mode: job.mode,
    });

    if (format === 'json') {
      // Return JSON results
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${job.mode}-${id}.json"`);
      res.status(200).json(job.result);
    } else {
      // Convert to CSV based on mode
      const csv = convertToCSV(job.result, job.mode);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${job.mode}-${id}.csv"`);
      res.status(200).send(csv);
    }
  } catch (error) {
    logger.error('Download API error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      jobId: req.query.id,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

function convertToCSV(result: any, mode: string): string {
  if (!result.results || !Array.isArray(result.results)) {
    return 'No data available';
  }

  const successfulResults = result.results.filter((r: any) => r.success && r.data);

  if (successfulResults.length === 0) {
    return 'No successful results to export';
  }

  try {
    switch (mode) {
      case 'news-articles':
        return convertNewsToCSV(successfulResults);
      case 'sports':
        return convertSportsToCSV(successfulResults);
      case 'supplier-directory':
        return convertCompaniesToCSV(successfulResults);
      default:
        return convertGenericToCSV(successfulResults);
    }
  } catch (error) {
    logger.error('CSV conversion failed', { mode, error });
    return 'Error converting data to CSV';
  }
}

function convertNewsToCSV(results: any[]): string {
  const headers = [
    'URL',
    'Title',
    'Author',
    'Publish Date',
    'Excerpt',
    'Word Count',
    'Category',
    'Confidence',
  ];
  const rows = results.map(result => [
    result.url,
    result.data.title || '',
    result.data.author || result.data.byline || '',
    result.data.publishDate || '',
    result.data.excerpt || '',
    result.data.wordCount || '',
    result.data.category || '',
    result.data.metadata?.confidence || '',
  ]);

  return [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function convertSportsToCSV(results: any[]): string {
  const headers = ['URL', 'Player Name', 'Position', 'Team', 'Confidence', 'Site'];
  const rows = results.map(result => [
    result.url,
    result.data.playerName || '',
    result.data.position || '',
    result.data.team || '',
    result.data.metadata?.confidence || '',
    result.data.metadata?.site || '',
  ]);

  return [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function convertCompaniesToCSV(results: any[]): string {
  // Flatten company data from all results
  const allCompanies: any[] = [];
  results.forEach(result => {
    if (result.data?.companies) {
      result.data.companies.forEach((company: any) => {
        allCompanies.push({
          sourceUrl: result.url,
          name: company.name || '',
          website: company.website || '',
          email: company.email || '',
          phone: company.phone || '',
          address: company.address || '',
          description: company.description || '',
          category: company.category || '',
          confidence: company.metadata?.confidence || '',
        });
      });
    }
  });

  if (allCompanies.length === 0) {
    return 'No companies found';
  }

  const headers = [
    'Source URL',
    'Company Name',
    'Website',
    'Email',
    'Phone',
    'Address',
    'Description',
    'Category',
    'Confidence',
  ];
  const rows = allCompanies.map(company => [
    company.sourceUrl,
    company.name,
    company.website,
    company.email,
    company.phone,
    company.address,
    company.description,
    company.category,
    company.confidence,
  ]);

  return [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function convertGenericToCSV(results: any[]): string {
  const headers = ['URL', 'Success', 'Data'];
  const rows = results.map(result => [
    result.url,
    result.success ? 'Yes' : 'No',
    JSON.stringify(result.data || {}),
  ]);

  return [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

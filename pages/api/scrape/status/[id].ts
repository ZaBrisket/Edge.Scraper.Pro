/**
 * Job Status API Endpoint
 * GET /api/scrape/status/[id]
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createLogger } from '../../../../src/lib/logger';

const logger = createLogger('api-scrape-status');

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
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const job = jobs.get(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Return job status
    const status = {
      id: job.id,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
      startTime: job.startTime,
      endTime: job.endTime,
    };

    logger.debug('Job status requested', {
      jobId: id,
      status: job.status,
      progress: job.progress,
    });

    res.status(200).json(status);

  } catch (error) {
    logger.error('Status API error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      jobId: req.query.id,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export { jobs };
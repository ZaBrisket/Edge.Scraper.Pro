/**
 * Cancel Job API Endpoint
 * POST /api/scrape/cancel/[id]
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createLogger } from '../../../../src/lib/logger';

const logger = createLogger('api-scrape-cancel');

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
  if (req.method !== 'POST') {
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

    // Only allow cancellation of running jobs
    if (job.status !== 'running' && job.status !== 'pending') {
      return res.status(400).json({ 
        error: `Cannot cancel job with status: ${job.status}` 
      });
    }

    // Update job status to cancelled
    job.status = 'cancelled';
    job.endTime = new Date().toISOString();
    job.error = 'Job was cancelled by user';
    jobs.set(id, job);

    logger.info('Job cancelled', {
      jobId: id,
      cancelledAt: job.endTime,
    });

    res.status(200).json({ 
      message: 'Job cancelled successfully',
      jobId: id,
    });

  } catch (error) {
    logger.error('Cancel API error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      jobId: req.query.id,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}
/**
 * API Controller
 * HTTP request handling for the task API
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { startJob, getJobStatus, cancelJob } from './dispatcher';
import { createLogger } from '../core/log';

const logger = createLogger('api-controller');

export async function handleStartRequest(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { taskName, input } = req.body;

    if (!taskName || !input) {
      return res.status(400).json({ error: 'taskName and input are required' });
    }

    const result = await startJob({ taskName, input });
    res.status(200).json(result);

  } catch (error) {
    logger.error('Start job API error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function handleStatusRequest(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId } = req.query;

    if (!jobId || typeof jobId !== 'string') {
      return res.status(400).json({ error: 'jobId is required' });
    }

    const result = await getJobStatus(jobId);
    res.status(200).json(result);

  } catch (error) {
    if (error instanceof Error && error.message === 'Job not found') {
      return res.status(404).json({ error: 'Job not found' });
    }

    logger.error('Status job API error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function handleCancelRequest(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId } = req.body;

    if (!jobId) {
      return res.status(400).json({ error: 'jobId is required' });
    }

    const result = await cancelJob(jobId);
    res.status(200).json(result);

  } catch (error) {
    if (error instanceof Error && error.message === 'Job not found') {
      return res.status(404).json({ error: 'Job not found' });
    }

    logger.error('Cancel job API error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}
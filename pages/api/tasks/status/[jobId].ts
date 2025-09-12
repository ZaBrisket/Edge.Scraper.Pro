/**
 * Task Status API Endpoint
 * GET /api/tasks/status/[jobId]
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { handleStatusRequest } from '../../../../api/controller';

export default handleStatusRequest;
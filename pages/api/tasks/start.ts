/**
 * Start Task API Endpoint
 * POST /api/tasks/start
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { handleStartRequest } from '../../../api/controller';

export default handleStartRequest;

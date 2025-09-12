/**
 * Cancel Task API Endpoint
 * POST /api/tasks/cancel
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { handleCancelRequest } from '../../../api/controller';

export default handleCancelRequest;

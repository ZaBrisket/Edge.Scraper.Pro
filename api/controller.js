"use strict";
/**
 * API Controller
 * HTTP request handling for the task API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStartRequest = handleStartRequest;
exports.handleStatusRequest = handleStatusRequest;
exports.handleCancelRequest = handleCancelRequest;
const dispatcher_1 = require("./dispatcher");
const log_1 = require("../core/log");
const logger = (0, log_1.createLogger)('api-controller');
async function handleStartRequest(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
        const { taskName, input } = req.body;
        if (!taskName || !input) {
            return res.status(400).json({ error: 'taskName and input are required' });
        }
        const result = await (0, dispatcher_1.startJob)({ taskName, input });
        res.status(200).json(result);
    }
    catch (error) {
        logger.error('Start job API error', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        res.status(500).json({ error: 'Internal server error' });
    }
}
async function handleStatusRequest(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
        const { jobId } = req.query;
        if (!jobId || typeof jobId !== 'string') {
            return res.status(400).json({ error: 'jobId is required' });
        }
        const result = await (0, dispatcher_1.getJobStatus)(jobId);
        res.status(200).json(result);
    }
    catch (error) {
        if (error instanceof Error && error.message === 'Job not found') {
            return res.status(404).json({ error: 'Job not found' });
        }
        logger.error('Status job API error', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        res.status(500).json({ error: 'Internal server error' });
    }
}
async function handleCancelRequest(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
        const { jobId } = req.body;
        if (!jobId) {
            return res.status(400).json({ error: 'jobId is required' });
        }
        const result = await (0, dispatcher_1.cancelJob)(jobId);
        res.status(200).json(result);
    }
    catch (error) {
        if (error instanceof Error && error.message === 'Job not found') {
            return res.status(404).json({ error: 'Job not found' });
        }
        logger.error('Cancel job API error', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        res.status(500).json({ error: 'Internal server error' });
    }
}
//# sourceMappingURL=controller.js.map
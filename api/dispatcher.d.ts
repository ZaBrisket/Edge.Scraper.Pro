/**
 * API Dispatcher
 * HTTP API layer for task execution
 */
declare const jobs: Map<string, any>;
export interface JobRequest {
    taskName: string;
    input: any;
}
export interface JobResponse {
    jobId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
    progress?: {
        completed: number;
        total: number;
        percentage: number;
        errors: number;
    };
}
export declare function startJob(req: JobRequest): Promise<{
    jobId: string;
}>;
export declare function getJobStatus(jobId: string): Promise<JobResponse>;
export declare function cancelJob(jobId: string): Promise<{
    success: boolean;
}>;
export { jobs };
//# sourceMappingURL=dispatcher.d.ts.map
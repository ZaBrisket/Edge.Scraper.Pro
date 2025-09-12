/**
 * API Models
 * Data models for the task API
 */
export interface TaskInfo {
    name: string;
    enabled: boolean;
    usageCount: number;
    lastUsed?: Date;
    registered: Date;
}
export interface JobInfo {
    id: string;
    taskName: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: {
        completed: number;
        total: number;
        percentage: number;
        errors: number;
    };
    result?: any;
    error?: string;
    startTime: string;
    endTime?: string;
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    metadata?: {
        timestamp: string;
        requestId: string;
    };
}
export interface TaskListResponse {
    tasks: TaskInfo[];
    stats: {
        totalTasks: number;
        enabledTasks: number;
        disabledTasks: number;
        totalUsage: number;
        mostUsedTask?: string;
    };
}
export interface JobStartRequest {
    taskName: string;
    input: any;
}
export interface JobStartResponse {
    jobId: string;
}
export interface JobStatusResponse {
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
export interface JobCancelRequest {
    jobId: string;
}
export interface JobCancelResponse {
    success: boolean;
}
//# sourceMappingURL=models.d.ts.map
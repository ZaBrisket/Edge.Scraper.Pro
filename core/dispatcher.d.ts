/**
 * Task Dispatcher
 * Central registry and execution engine for all tasks
 */
import { ScrapeTask, TaskContext } from './types';
export declare class TaskDispatcher {
    private tasks;
    private logger;
    constructor();
    /**
     * Register a new task
     */
    register<I, O>(task: ScrapeTask<I, O>): void;
    /**
     * Unregister a task
     */
    unregister(taskName: string): boolean;
    /**
     * Get a specific task
     */
    getTask(taskName: string): ScrapeTask<any, any>;
    /**
     * List all available tasks
     */
    listTasks(): Array<{
        name: string;
        enabled: boolean;
        usageCount: number;
        lastUsed?: Date;
        registered: Date;
    }>;
    /**
     * Get enabled tasks only
     */
    getEnabledTasks(): ScrapeTask<any, any>[];
    /**
     * Check if a task exists
     */
    hasTask(taskName: string): boolean;
    /**
     * Enable/disable a task
     */
    setTaskEnabled(taskName: string, enabled: boolean): void;
    /**
     * Get dispatcher statistics
     */
    getStats(): {
        totalTasks: number;
        enabledTasks: number;
        disabledTasks: number;
        totalUsage: number;
        mostUsedTask?: string;
    };
    /**
     * Validate task input before execution
     */
    validateInput(taskName: string, input: any): Promise<{
        valid: boolean;
        errors?: string[];
    }>;
    /**
     * Execute a task with input
     */
    execute(taskName: string, input: any, context: TaskContext): Promise<any>;
    /**
     * Clear all tasks (mainly for testing)
     */
    clear(): void;
}
export declare const taskDispatcher: TaskDispatcher;
export declare function registerTask<I, O>(task: ScrapeTask<I, O>): void;
export declare function runTask(taskName: string, payload: any, context: TaskContext): Promise<any>;
export declare function getTask(taskName: string): ScrapeTask<any, any>;
export declare function listTasks(): Array<{
    name: string;
    enabled: boolean;
    usageCount: number;
    lastUsed?: Date;
    registered: Date;
}>;
//# sourceMappingURL=dispatcher.d.ts.map
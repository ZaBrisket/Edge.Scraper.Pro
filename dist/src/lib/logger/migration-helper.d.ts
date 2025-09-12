/**
 * Migration Helper for Console.log Replacement
 *
 * This utility helps identify and replace console.log usage
 * with the centralized logger throughout the codebase.
 */
export interface ConsoleUsage {
    file: string;
    line: number;
    method: 'log' | 'info' | 'warn' | 'error' | 'debug';
    content: string;
}
export declare class ConsoleMigrationHelper {
    private consoleUsages;
    /**
     * Scan directory for console usage
     */
    scanDirectory(dirPath: string, extensions?: string[]): ConsoleUsage[];
    private _scanDirectoryRecursive;
    private _scanFile;
    /**
     * Generate migration report
     */
    generateReport(): string;
    /**
     * Get console usages by file
     */
    getUsagesByFile(): Record<string, ConsoleUsage[]>;
    /**
     * Get console usages by method
     */
    getUsagesByMethod(): Record<string, ConsoleUsage[]>;
}
export declare const scanForConsoleUsage: (dirPath: string) => ConsoleUsage[];
export declare const generateMigrationReport: (dirPath: string) => string;
//# sourceMappingURL=migration-helper.d.ts.map
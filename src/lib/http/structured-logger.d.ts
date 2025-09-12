export declare class StructuredLogger {
  constructor(options?: any);
  logRequest(event: any): Promise<void>;
  logPaginationDiscovery(event: any): Promise<void>;
  logCanonicalization(event: any): Promise<void>;
  logBatchSummary(summary: any): Promise<void>;
  createRequestLogEntry(fetchResult: any): any;
  categorizeErrorForLogging(fetchResult: any): string;
  writeLogEntry(logEntry: any): Promise<void>;
  writeSummaryFile(summary: any): Promise<void>;
  checkAndRotateLog(): Promise<void>;
  getStats(): any;
  finalize(): Promise<void>;
}
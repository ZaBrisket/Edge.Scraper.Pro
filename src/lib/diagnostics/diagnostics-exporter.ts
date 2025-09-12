/**
 * Diagnostics Exporter
 * 
 * Exports detailed diagnostics with error taxonomy
 * for troubleshooting and monitoring
 */

import { createLogger } from '../logger';

export interface DiagnosticData {
  timestamp: string;
  batchId: string;
  totalUrls: number;
  successfulUrls: number;
  failedUrls: number;
  skippedUrls: number;
  duration: number;
  errors: DiagnosticError[];
  warnings: DiagnosticWarning[];
  performance: PerformanceMetrics;
  system: SystemMetrics;
  configuration: ConfigurationInfo;
}

export interface DiagnosticError {
  url: string;
  error: string;
  category: ErrorCategory;
  timestamp: number;
  attempt: number;
  retryable: boolean;
  httpStatus?: number;
  responseTime?: number;
  stackTrace?: string;
  context?: Record<string, any>;
}

export interface DiagnosticWarning {
  url: string;
  warning: string;
  category: WarningCategory;
  timestamp: number;
  context?: Record<string, any>;
}

export interface PerformanceMetrics {
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retryCount: number;
  circuitBreakerTrips: number;
  rateLimitHits: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  cpuUsage: {
    user: number;
    system: number;
    percentage: number;
  };
}

export interface SystemMetrics {
  nodeVersion: string;
  platform: string;
  arch: string;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  environment: string;
  version: string;
}

export interface ConfigurationInfo {
  concurrency: number;
  delayMs: number;
  timeout: number;
  maxRetries: number;
  extractionMode: string;
  enableUrlNormalization: boolean;
  enablePaginationDiscovery: boolean;
  enableExtractorRouter: boolean;
  enableStructuredLogging: boolean;
}

export type ErrorCategory = 
  | 'http_404' 
  | 'http_403' 
  | 'http_401' 
  | 'http_500' 
  | 'http_502' 
  | 'http_503' 
  | 'http_429' 
  | 'dns_error' 
  | 'timeout' 
  | 'network_error' 
  | 'ssl_error' 
  | 'rate_limit' 
  | 'circuit_breaker' 
  | 'validation_error' 
  | 'extraction_error' 
  | 'parser_error' 
  | 'robots_txt' 
  | 'anti_bot' 
  | 'redirect_loop' 
  | 'unknown';

export type WarningCategory = 
  | 'low_content_quality' 
  | 'missing_metadata' 
  | 'slow_response' 
  | 'high_retry_rate' 
  | 'memory_usage' 
  | 'circuit_breaker_warning' 
  | 'rate_limit_warning' 
  | 'validation_warning' 
  | 'extraction_warning';

export class DiagnosticsExporter {
  private logger: ReturnType<typeof createLogger>;

  constructor() {
    this.logger = createLogger('diagnostics-exporter');
  }

  /**
   * Generate comprehensive diagnostics from batch result
   */
  generateDiagnostics(
    batchResult: any,
    configuration: ConfigurationInfo,
    startTime: number,
    endTime: number
  ): DiagnosticData {
    const duration = endTime - startTime;
    const errors = this.categorizeErrors(batchResult.errors || []);
    const warnings = this.generateWarnings(batchResult, duration);
    const performance = this.calculatePerformanceMetrics(batchResult, duration);
    const system = this.getSystemMetrics();

    return {
      timestamp: new Date().toISOString(),
      batchId: batchResult.batchId || 'unknown',
      totalUrls: batchResult.stats?.totalUrls || 0,
      successfulUrls: batchResult.stats?.successfulUrls || 0,
      failedUrls: batchResult.stats?.failedUrls || 0,
      skippedUrls: batchResult.stats?.skippedUrls || 0,
      duration,
      errors,
      warnings,
      performance,
      system,
      configuration,
    };
  }

  /**
   * Categorize errors with detailed taxonomy
   */
  private categorizeErrors(errors: any[]): DiagnosticError[] {
    return errors.map(error => ({
      url: error.url || 'unknown',
      error: error.error || 'Unknown error',
      category: this.categorizeError(error),
      timestamp: error.timestamp || Date.now(),
      attempt: error.attempt || 1,
      retryable: error.retryable || false,
      httpStatus: this.extractHttpStatus(error.error),
      responseTime: error.responseTime,
      stackTrace: error.stackTrace,
      context: this.extractErrorContext(error),
    }));
  }

  /**
   * Categorize individual error
   */
  private categorizeError(error: any): ErrorCategory {
    const message = (error.error || '').toLowerCase();
    const status = this.extractHttpStatus(error.error);

    if (status === 404) return 'http_404';
    if (status === 403) return 'http_403';
    if (status === 401) return 'http_401';
    if (status === 500) return 'http_500';
    if (status === 502) return 'http_502';
    if (status === 503) return 'http_503';
    if (status === 429) return 'http_429';

    if (message.includes('timeout')) return 'timeout';
    if (message.includes('dns') || message.includes('enotfound')) return 'dns_error';
    if (message.includes('network') || message.includes('connection')) return 'network_error';
    if (message.includes('ssl') || message.includes('certificate')) return 'ssl_error';
    if (message.includes('rate limit')) return 'rate_limit';
    if (message.includes('circuit')) return 'circuit_breaker';
    if (message.includes('validation')) return 'validation_error';
    if (message.includes('extraction')) return 'extraction_error';
    if (message.includes('parser')) return 'parser_error';
    if (message.includes('robots')) return 'robots_txt';
    if (message.includes('cloudflare') || message.includes('challenge')) return 'anti_bot';
    if (message.includes('redirect')) return 'redirect_loop';

    return 'unknown';
  }

  /**
   * Extract HTTP status from error message
   */
  private extractHttpStatus(errorMessage: string): number | undefined {
    const match = errorMessage.match(/HTTP (\d{3})/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Extract error context
   */
  private extractErrorContext(error: any): Record<string, any> {
    const context: Record<string, any> = {};

    if (error.category) context.category = error.category;
    if (error.retryable !== undefined) context.retryable = error.retryable;
    if (error.attempt) context.attempt = error.attempt;
    if (error.responseTime) context.responseTime = error.responseTime;

    return context;
  }

  /**
   * Generate warnings based on batch results
   */
  private generateWarnings(batchResult: any, duration: number): DiagnosticWarning[] {
    const warnings: DiagnosticWarning[] = [];
    const now = Date.now();

    // Check for low content quality
    const results = batchResult.results || [];
    const lowQualityItems = results.filter((item: any) => 
      item.success && item.data?.content && item.data.content.length < 1000
    );

    if (lowQualityItems.length > 0) {
      warnings.push({
        url: 'batch',
        warning: `${lowQualityItems.length} items have low content quality`,
        category: 'low_content_quality',
        timestamp: now,
        context: { count: lowQualityItems.length },
      });
    }

    // Check for slow responses
    const responseTimes = results
      .filter((item: any) => item.responseTime)
      .map((item: any) => item.responseTime);
    
    if (responseTimes.length > 0) {
      const avgResponseTime = responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length;
      if (avgResponseTime > 5000) {
        warnings.push({
          url: 'batch',
          warning: `Average response time is high: ${avgResponseTime.toFixed(0)}ms`,
          category: 'slow_response',
          timestamp: now,
          context: { averageResponseTime: avgResponseTime },
        });
      }
    }

    // Check for high failure rate
    const failureRate = (batchResult.stats?.failedUrls || 0) / (batchResult.stats?.totalUrls || 1);
    if (failureRate > 0.3) {
      warnings.push({
        url: 'batch',
        warning: `High failure rate: ${(failureRate * 100).toFixed(1)}%`,
        category: 'high_retry_rate',
        timestamp: now,
        context: { failureRate },
      });
    }

    return warnings;
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(batchResult: any, duration: number): PerformanceMetrics {
    const results = batchResult.results || [];
    const responseTimes = results
      .filter((item: any) => item.responseTime)
      .map((item: any) => item.responseTime);

    const totalRequests = results.length;
    const successfulRequests = results.filter((item: any) => item.success).length;
    const failedRequests = totalRequests - successfulRequests;

    return {
      averageResponseTime: responseTimes.length > 0 
        ? responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length 
        : 0,
      minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
      totalRequests,
      successfulRequests,
      failedRequests,
      retryCount: results.reduce((count: number, item: any) => 
        count + (item.attempt || 1) - 1, 0),
      circuitBreakerTrips: 0, // TODO: Track from HTTP client
      rateLimitHits: 0, // TODO: Track from HTTP client
      memoryUsage: this.getMemoryUsage(),
      cpuUsage: this.getCpuUsage(),
    };
  }

  /**
   * Get system metrics
   */
  private getSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memoryUsage: memUsage,
      cpuUsage: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        percentage: 0, // TODO: Calculate actual percentage
      },
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || 'unknown',
    };
  }

  /**
   * Get memory usage percentage
   */
  private getMemoryUsage(): { used: number; total: number; percentage: number } {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal + memUsage.external;
    const usedMemory = memUsage.heapUsed + memUsage.external;
    
    return {
      used: usedMemory,
      total: totalMemory,
      percentage: (usedMemory / totalMemory) * 100,
    };
  }

  /**
   * Get CPU usage
   */
  private getCpuUsage(): { user: number; system: number; percentage: number } {
    const cpuUsage = process.cpuUsage();
    
    return {
      user: cpuUsage.user,
      system: cpuUsage.system,
      percentage: 0, // TODO: Calculate actual percentage
    };
  }

  /**
   * Export diagnostics as JSON
   */
  exportAsJson(diagnostics: DiagnosticData): string {
    return JSON.stringify(diagnostics, null, 2);
  }

  /**
   * Export error summary
   */
  exportErrorSummary(diagnostics: DiagnosticData): {
    totalErrors: number;
    errorBreakdown: Record<ErrorCategory, number>;
    topErrors: Array<{ category: ErrorCategory; count: number; percentage: number }>;
    retryableErrors: number;
    nonRetryableErrors: number;
  } {
    const errors = diagnostics.errors;
    const totalErrors = errors.length;

    const errorBreakdown: Record<ErrorCategory, number> = {} as Record<ErrorCategory, number>;
    errors.forEach(error => {
      errorBreakdown[error.category] = (errorBreakdown[error.category] || 0) + 1;
    });

    const topErrors = Object.entries(errorBreakdown)
      .map(([category, count]) => ({
        category: category as ErrorCategory,
        count,
        percentage: (count / totalErrors) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const retryableErrors = errors.filter(error => error.retryable).length;
    const nonRetryableErrors = totalErrors - retryableErrors;

    return {
      totalErrors,
      errorBreakdown,
      topErrors,
      retryableErrors,
      nonRetryableErrors,
    };
  }

  /**
   * Export performance summary
   */
  exportPerformanceSummary(diagnostics: DiagnosticData): {
    totalDuration: number;
    averageResponseTime: number;
    successRate: number;
    throughput: number;
    memoryUsage: number;
    recommendations: string[];
  } {
    const perf = diagnostics.performance;
    const successRate = (perf.successfulRequests / perf.totalRequests) * 100;
    const throughput = perf.totalRequests / (diagnostics.duration / 1000); // requests per second

    const recommendations: string[] = [];
    
    if (perf.averageResponseTime > 5000) {
      recommendations.push('Consider increasing timeout or reducing concurrency');
    }
    
    if (successRate < 80) {
      recommendations.push('High failure rate detected - check error categories');
    }
    
    if (perf.memoryUsage.percentage > 80) {
      recommendations.push('High memory usage - consider reducing batch size');
    }
    
    if (throughput < 1) {
      recommendations.push('Low throughput - consider increasing concurrency');
    }

    return {
      totalDuration: diagnostics.duration,
      averageResponseTime: perf.averageResponseTime,
      successRate,
      throughput,
      memoryUsage: perf.memoryUsage.percentage,
      recommendations,
    };
  }
}
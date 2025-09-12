/**
 * Migration Helper for Console.log Replacement
 *
 * This utility helps identify and replace console.log usage
 * with the centralized logger throughout the codebase.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { logger } from './index';

export interface ConsoleUsage {
  file: string;
  line: number;
  method: 'log' | 'info' | 'warn' | 'error' | 'debug';
  content: string;
}

export class ConsoleMigrationHelper {
  private consoleUsages: ConsoleUsage[] = [];

  /**
   * Scan directory for console usage
   */
  scanDirectory(dirPath: string, extensions: string[] = ['.ts', '.js']): ConsoleUsage[] {
    this.consoleUsages = [];
    this._scanDirectoryRecursive(dirPath, extensions);
    return this.consoleUsages;
  }

  private _scanDirectoryRecursive(dirPath: string, extensions: string[]): void {
    try {
      const items = readdirSync(dirPath);

      for (const item of items) {
        const fullPath = join(dirPath, item);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip node_modules, dist, build directories
          if (!['node_modules', 'dist', 'build', '.git'].includes(item)) {
            this._scanDirectoryRecursive(fullPath, extensions);
          }
        } else if (stat.isFile()) {
          const ext = extname(fullPath);
          if (extensions.includes(ext)) {
            this._scanFile(fullPath);
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to scan directory ${dirPath}: ${error}`);
    }
  }

  private _scanFile(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        const lineNumber = index + 1;

        // Match console.log, console.info, console.warn, console.error, console.debug
        const consoleMatch = line.match(/console\.(log|info|warn|error|debug)\s*\(/);
        if (consoleMatch) {
          this.consoleUsages.push({
            file: filePath,
            line: lineNumber,
            method: consoleMatch[1] as ConsoleUsage['method'],
            content: line.trim(),
          });
        }
      });
    } catch (error) {
      logger.warn(`Failed to scan file ${filePath}: ${error}`);
    }
  }

  /**
   * Generate migration report
   */
  generateReport(): string {
    const report = ['Console Usage Migration Report', '='.repeat(40), ''];

    const byFile = this.consoleUsages.reduce(
      (acc, usage) => {
        if (!acc[usage.file]) {
          acc[usage.file] = [];
        }
        acc[usage.file].push(usage);
        return acc;
      },
      {} as Record<string, ConsoleUsage[]>
    );

    for (const [file, usages] of Object.entries(byFile)) {
      report.push(`File: ${file}`);
      report.push(`  Total console usages: ${usages.length}`);

      const byMethod = usages.reduce(
        (acc, usage) => {
          acc[usage.method] = (acc[usage.method] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      for (const [method, count] of Object.entries(byMethod)) {
        report.push(`    ${method}: ${count}`);
      }

      report.push('');
    }

    report.push(`Total files with console usage: ${Object.keys(byFile).length}`);
    report.push(`Total console usages: ${this.consoleUsages.length}`);

    return report.join('\n');
  }

  /**
   * Get console usages by file
   */
  getUsagesByFile(): Record<string, ConsoleUsage[]> {
    return this.consoleUsages.reduce(
      (acc, usage) => {
        if (!acc[usage.file]) {
          acc[usage.file] = [];
        }
        acc[usage.file].push(usage);
        return acc;
      },
      {} as Record<string, ConsoleUsage[]>
    );
  }

  /**
   * Get console usages by method
   */
  getUsagesByMethod(): Record<string, ConsoleUsage[]> {
    return this.consoleUsages.reduce(
      (acc, usage) => {
        if (!acc[usage.method]) {
          acc[usage.method] = [];
        }
        acc[usage.method].push(usage);
        return acc;
      },
      {} as Record<string, ConsoleUsage[]>
    );
  }
}

// Export utility functions
export const scanForConsoleUsage = (dirPath: string): ConsoleUsage[] => {
  const helper = new ConsoleMigrationHelper();
  return helper.scanDirectory(dirPath);
};

export const generateMigrationReport = (dirPath: string): string => {
  const helper = new ConsoleMigrationHelper();
  helper.scanDirectory(dirPath);
  return helper.generateReport();
};

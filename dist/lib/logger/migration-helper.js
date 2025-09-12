"use strict";
/**
 * Migration Helper for Console.log Replacement
 *
 * This utility helps identify and replace console.log usage
 * with the centralized logger throughout the codebase.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMigrationReport = exports.scanForConsoleUsage = exports.ConsoleMigrationHelper = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const index_1 = require("./index");
class ConsoleMigrationHelper {
    constructor() {
        this.consoleUsages = [];
    }
    /**
     * Scan directory for console usage
     */
    scanDirectory(dirPath, extensions = ['.ts', '.js']) {
        this.consoleUsages = [];
        this._scanDirectoryRecursive(dirPath, extensions);
        return this.consoleUsages;
    }
    _scanDirectoryRecursive(dirPath, extensions) {
        try {
            const items = (0, fs_1.readdirSync)(dirPath);
            for (const item of items) {
                const fullPath = (0, path_1.join)(dirPath, item);
                const stat = (0, fs_1.statSync)(fullPath);
                if (stat.isDirectory()) {
                    // Skip node_modules, dist, build directories
                    if (!['node_modules', 'dist', 'build', '.git'].includes(item)) {
                        this._scanDirectoryRecursive(fullPath, extensions);
                    }
                }
                else if (stat.isFile()) {
                    const ext = (0, path_1.extname)(fullPath);
                    if (extensions.includes(ext)) {
                        this._scanFile(fullPath);
                    }
                }
            }
        }
        catch (error) {
            index_1.logger.warn(`Failed to scan directory ${dirPath}: ${error}`);
        }
    }
    _scanFile(filePath) {
        try {
            const content = (0, fs_1.readFileSync)(filePath, 'utf8');
            const lines = content.split('\n');
            lines.forEach((line, index) => {
                const lineNumber = index + 1;
                // Match console.log, console.info, console.warn, console.error, console.debug
                const consoleMatch = line.match(/console\.(log|info|warn|error|debug)\s*\(/);
                if (consoleMatch) {
                    this.consoleUsages.push({
                        file: filePath,
                        line: lineNumber,
                        method: consoleMatch[1],
                        content: line.trim(),
                    });
                }
            });
        }
        catch (error) {
            index_1.logger.warn(`Failed to scan file ${filePath}: ${error}`);
        }
    }
    /**
     * Generate migration report
     */
    generateReport() {
        const report = ['Console Usage Migration Report', '='.repeat(40), ''];
        const byFile = this.consoleUsages.reduce((acc, usage) => {
            if (!acc[usage.file]) {
                acc[usage.file] = [];
            }
            acc[usage.file].push(usage);
            return acc;
        }, {});
        for (const [file, usages] of Object.entries(byFile)) {
            report.push(`File: ${file}`);
            report.push(`  Total console usages: ${usages.length}`);
            const byMethod = usages.reduce((acc, usage) => {
                acc[usage.method] = (acc[usage.method] || 0) + 1;
                return acc;
            }, {});
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
    getUsagesByFile() {
        return this.consoleUsages.reduce((acc, usage) => {
            if (!acc[usage.file]) {
                acc[usage.file] = [];
            }
            acc[usage.file].push(usage);
            return acc;
        }, {});
    }
    /**
     * Get console usages by method
     */
    getUsagesByMethod() {
        return this.consoleUsages.reduce((acc, usage) => {
            if (!acc[usage.method]) {
                acc[usage.method] = [];
            }
            acc[usage.method].push(usage);
            return acc;
        }, {});
    }
}
exports.ConsoleMigrationHelper = ConsoleMigrationHelper;
// Export utility functions
const scanForConsoleUsage = (dirPath) => {
    const helper = new ConsoleMigrationHelper();
    return helper.scanDirectory(dirPath);
};
exports.scanForConsoleUsage = scanForConsoleUsage;
const generateMigrationReport = (dirPath) => {
    const helper = new ConsoleMigrationHelper();
    helper.scanDirectory(dirPath);
    return helper.generateReport();
};
exports.generateMigrationReport = generateMigrationReport;
//# sourceMappingURL=migration-helper.js.map
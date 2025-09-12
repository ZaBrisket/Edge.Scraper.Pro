/**
 * CLI Adapter
 * Backward compatibility adapter for CLI usage
 */

import { createLogger } from '../lib/logger';
import { taskDispatcher } from '../../core/dispatcher';
import { TaskContext } from '../../core/types';
import { createRateLimiter } from '../../core/rateLimit';
import { createStorage } from '../../core/storage';
import { envConfig } from '../../core/config';

const logger = createLogger('cli-adapter');

// Mode to task mapping for backward compatibility
const modeToTaskMap: Record<string, string> = {
  'news-articles': 'news',
  'sports': 'sports',
  'supplier-directory': 'companies',
};

export class CLIAdapter {
  private rateLimiter = createRateLimiter(envConfig.get('rateLimit'));
  private storage = createStorage(envConfig.get('storage'));

  async executeMode(mode: string, input: any): Promise<any> {
    // Map legacy mode to new task name
    const taskName = modeToTaskMap[mode] || mode;

    if (!taskDispatcher.hasTask(taskName)) {
      throw new Error(`Unknown mode: ${mode}. Available modes: ${Object.keys(modeToTaskMap).join(', ')}`);
    }

    // Log deprecation warning
    if (modeToTaskMap[mode]) {
      logger.warn('Legacy mode used, consider migrating to new task API', {
        legacyMode: mode,
        newTaskName: taskName,
        migrationGuide: 'https://github.com/ZaBrisket/Edge.Scraper.Pro/blob/main/docs/migration.md',
      });
    }

    // Create task context
    const context: TaskContext = {
      http: null, // Will be provided by the task
      storage: this.storage,
      logger,
      rateLimiter: this.rateLimiter,
      config: envConfig.getAll(),
      jobId: `cli-${Date.now()}`,
      correlationId: `cli-${Date.now()}`,
    };

    // Execute task
    return await taskDispatcher.execute(taskName, input, context);
  }

  listAvailableModes(): Array<{ mode: string; task: string; deprecated: boolean }> {
    const modes = Object.entries(modeToTaskMap).map(([mode, task]) => ({
      mode,
      task,
      deprecated: true,
    }));

    // Add new task names
    const tasks = taskDispatcher.listTasks();
    tasks.forEach(task => {
      if (!Object.values(modeToTaskMap).includes(task.name)) {
        modes.push({
          mode: task.name,
          task: task.name,
          deprecated: false,
        });
      }
    });

    return modes;
  }

  getModeInfo(mode: string): { mode: string; task: string; deprecated: boolean; available: boolean } {
    const taskName = modeToTaskMap[mode] || mode;
    const available = taskDispatcher.hasTask(taskName);
    const deprecated = !!modeToTaskMap[mode];

    return {
      mode,
      task: taskName,
      deprecated,
      available,
    };
  }
}

// Export singleton instance
export const cliAdapter = new CLIAdapter();
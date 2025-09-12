/**
 * Task Initialization
 * Registers all available tasks with the dispatcher
 */

import { registerTask } from '../core/dispatcher';
import { newsTask } from './news';
import { sportsTask } from './sports';
import { companiesTask } from './companies';
import { createLogger } from '../core/log';

const logger = createLogger('task-initialization');

export function initializeTasks(): void {
  logger.info('Initializing tasks...');

  try {
    // Register all tasks
    registerTask(newsTask);
    logger.info('News task registered', { taskName: newsTask.name });

    registerTask(sportsTask);
    logger.info('Sports task registered', { taskName: sportsTask.name });

    registerTask(companiesTask);
    logger.info('Companies task registered', { taskName: companiesTask.name });

    logger.info('All tasks initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize tasks', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

// Auto-initialize tasks when this module is imported
initializeTasks();
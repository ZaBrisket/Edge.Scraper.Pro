"use strict";
/**
 * Task Initialization
 * Registers all available tasks with the dispatcher
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeTasks = initializeTasks;
const dispatcher_1 = require("../core/dispatcher");
const news_1 = require("./news");
const sports_1 = require("./sports");
const companies_1 = require("./companies");
const log_1 = require("../core/log");
const logger = (0, log_1.createLogger)('task-initialization');
function initializeTasks() {
    logger.info('Initializing tasks...');
    try {
        // Register all tasks
        (0, dispatcher_1.registerTask)(news_1.newsTask);
        logger.info('News task registered', { taskName: news_1.newsTask.name });
        (0, dispatcher_1.registerTask)(sports_1.sportsTask);
        logger.info('Sports task registered', { taskName: sports_1.sportsTask.name });
        (0, dispatcher_1.registerTask)(companies_1.companiesTask);
        logger.info('Companies task registered', { taskName: companies_1.companiesTask.name });
        logger.info('All tasks initialized successfully');
    }
    catch (error) {
        logger.error('Failed to initialize tasks', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
    }
}
// Auto-initialize tasks when this module is imported
initializeTasks();
//# sourceMappingURL=index.js.map
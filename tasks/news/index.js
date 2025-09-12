"use strict";
/**
 * News Task Module
 * Exports for the news scraping task
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.newsTask = exports.NewsOutputSchema = exports.NewsInputSchema = exports.NewsTask = void 0;
var task_1 = require("./task");
Object.defineProperty(exports, "NewsTask", { enumerable: true, get: function () { return task_1.NewsTask; } });
var schema_1 = require("./schema");
Object.defineProperty(exports, "NewsInputSchema", { enumerable: true, get: function () { return schema_1.NewsInputSchema; } });
Object.defineProperty(exports, "NewsOutputSchema", { enumerable: true, get: function () { return schema_1.NewsOutputSchema; } });
// Create and export the task instance
const task_2 = require("./task");
exports.newsTask = new task_2.NewsTask();
//# sourceMappingURL=index.js.map
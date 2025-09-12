"use strict";
/**
 * Companies Task Module
 * Exports for the companies scraping task
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.companiesTask = exports.CompaniesOutputSchema = exports.CompaniesInputSchema = exports.CompaniesTask = void 0;
var task_1 = require("./task");
Object.defineProperty(exports, "CompaniesTask", { enumerable: true, get: function () { return task_1.CompaniesTask; } });
var schema_1 = require("./schema");
Object.defineProperty(exports, "CompaniesInputSchema", { enumerable: true, get: function () { return schema_1.CompaniesInputSchema; } });
Object.defineProperty(exports, "CompaniesOutputSchema", { enumerable: true, get: function () { return schema_1.CompaniesOutputSchema; } });
// Create and export the task instance
const task_2 = require("./task");
exports.companiesTask = new task_2.CompaniesTask();
//# sourceMappingURL=index.js.map
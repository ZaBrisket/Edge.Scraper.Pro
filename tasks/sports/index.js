"use strict";
/**
 * Sports Task Module
 * Exports for the sports scraping task
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sportsTask = exports.SportsOutputSchema = exports.SportsInputSchema = exports.SportsTask = void 0;
var task_1 = require("./task");
Object.defineProperty(exports, "SportsTask", { enumerable: true, get: function () { return task_1.SportsTask; } });
var schema_1 = require("./schema");
Object.defineProperty(exports, "SportsInputSchema", { enumerable: true, get: function () { return schema_1.SportsInputSchema; } });
Object.defineProperty(exports, "SportsOutputSchema", { enumerable: true, get: function () { return schema_1.SportsOutputSchema; } });
// Create and export the task instance
const task_2 = require("./task");
exports.sportsTask = new task_2.SportsTask();
//# sourceMappingURL=index.js.map
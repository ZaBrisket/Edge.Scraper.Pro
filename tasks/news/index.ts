/**
 * News Task Module
 * Exports for the news scraping task
 */

export { NewsTask } from './task';
export { NewsInputSchema, NewsOutputSchema } from './schema';
export type { NewsInput, NewsOutput } from './schema';

// Create and export the task instance
import { NewsTask } from './task';
export const newsTask = new NewsTask();
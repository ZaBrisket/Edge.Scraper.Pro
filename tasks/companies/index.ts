/**
 * Companies Task Module
 * Exports for the companies scraping task
 */

export { CompaniesTask } from './task';
export { CompaniesInputSchema, CompaniesOutputSchema } from './schema';
export type { CompaniesInput, CompaniesOutput } from './schema';

// Create and export the task instance
import { CompaniesTask } from './task';
export const companiesTask = new CompaniesTask();
/**
 * Sports Task Module
 * Exports for the sports scraping task
 */

export { SportsTask } from './task';
export { SportsInputSchema, SportsOutputSchema } from './schema';
export type { SportsInput, SportsOutput } from './schema';

// Create and export the task instance
import { SportsTask } from './task';
export const sportsTask = new SportsTask();
/**
 * Mode Registry Initialization
 * Registers all available modes with the global registry
 */

import { modeRegistry } from './registry';
import { SupplierDirectoryMode } from './supplier-directory';
import { NewsArticlesMode } from './news-articles';
import { SportsMode } from './sports';
import { createLogger } from '../lib/logger';

const logger = createLogger('mode-initialization');

/**
 * Initialize all modes by registering them with the global registry
 */
export function initializeModes(): void {
  try {
    logger.info('Initializing modes...');

    // Register all available modes
    const modes = [
      new SupplierDirectoryMode(),
      new NewsArticlesMode(),
      new SportsMode(),
    ];

    let registeredCount = 0;
    for (const mode of modes) {
      try {
        modeRegistry.register(mode);
        registeredCount++;
        logger.info('Mode registered successfully', {
          modeId: mode.id,
          label: mode.label,
          version: mode.version,
        });
      } catch (error) {
        logger.error('Failed to register mode', {
          modeId: mode.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info('Mode initialization completed', {
      totalModes: modes.length,
      registeredModes: registeredCount,
      failedModes: modes.length - registeredCount,
    });

  } catch (error) {
    logger.error('Mode initialization failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Get registry statistics for monitoring
 */
export function getModeStats() {
  return modeRegistry.getStats();
}

/**
 * List all available modes
 */
export function listAvailableModes() {
  return modeRegistry.listModes();
}

// Export the registry for direct access if needed
export { modeRegistry } from './registry';

// Export mode classes for testing
export { SupplierDirectoryMode, NewsArticlesMode, SportsMode };
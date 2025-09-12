/**
 * Mode Registry
 * Central registry for managing pluggable scraping modes
 */

import { createLogger } from '../lib/logger';
import {
  ModeContract,
  ModeRegistryEntry,
  ModeNotFoundError,
  ModeError,
  isModeContract,
} from './types';

export class ModeRegistry {
  private modes = new Map<string, ModeRegistryEntry>();
  private logger = createLogger('mode-registry');

  constructor() {
    this.logger.info('Mode registry initialized');
  }

  /**
   * Register a new mode
   */
  register(mode: ModeContract): void {
    if (!isModeContract(mode)) {
      throw new ModeError(
        'Invalid mode contract',
        'INVALID_CONTRACT',
        { mode }
      );
    }

    if (this.modes.has(mode.id)) {
      this.logger.warn('Mode already registered, updating', { modeId: mode.id });
    }

    const entry: ModeRegistryEntry = {
      mode,
      registered: new Date(),
      usageCount: 0,
      enabled: true,
    };

    this.modes.set(mode.id, entry);
    this.logger.info('Mode registered', {
      modeId: mode.id,
      label: mode.label,
      version: mode.version,
    });
  }

  /**
   * Unregister a mode
   */
  unregister(modeId: string): boolean {
    const deleted = this.modes.delete(modeId);
    if (deleted) {
      this.logger.info('Mode unregistered', { modeId });
    }
    return deleted;
  }

  /**
   * Get a specific mode
   */
  getMode(modeId: string): ModeContract {
    const entry = this.modes.get(modeId);
    if (!entry) {
      throw new ModeNotFoundError(modeId);
    }

    if (!entry.enabled) {
      throw new ModeError(
        `Mode is disabled: ${modeId}`,
        'MODE_DISABLED',
        { modeId }
      );
    }

    // Update usage tracking
    entry.usageCount++;
    entry.lastUsed = new Date();

    return entry.mode;
  }

  /**
   * List all available modes
   */
  listModes(): Array<{
    id: string;
    label: string;
    description?: string;
    version: string;
    enabled: boolean;
    usageCount: number;
    lastUsed?: Date;
  }> {
    return Array.from(this.modes.values()).map(entry => ({
      id: entry.mode.id,
      label: entry.mode.label,
      description: entry.mode.description,
      version: entry.mode.version,
      enabled: entry.enabled,
      usageCount: entry.usageCount,
      lastUsed: entry.lastUsed,
    }));
  }

  /**
   * Get enabled modes only
   */
  getEnabledModes(): ModeContract[] {
    return Array.from(this.modes.values())
      .filter(entry => entry.enabled)
      .map(entry => entry.mode);
  }

  /**
   * Check if a mode exists
   */
  hasMode(modeId: string): boolean {
    return this.modes.has(modeId);
  }

  /**
   * Enable/disable a mode
   */
  setModeEnabled(modeId: string, enabled: boolean): void {
    const entry = this.modes.get(modeId);
    if (!entry) {
      throw new ModeNotFoundError(modeId);
    }

    entry.enabled = enabled;
    this.logger.info('Mode status changed', { modeId, enabled });
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalModes: number;
    enabledModes: number;
    disabledModes: number;
    totalUsage: number;
    mostUsedMode?: string;
  } {
    const entries = Array.from(this.modes.values());
    const totalUsage = entries.reduce((sum, entry) => sum + entry.usageCount, 0);
    const mostUsed = entries.reduce((max, entry) => 
      entry.usageCount > (max?.usageCount || 0) ? entry : max, 
      null as ModeRegistryEntry | null
    );

    return {
      totalModes: entries.length,
      enabledModes: entries.filter(e => e.enabled).length,
      disabledModes: entries.filter(e => !e.enabled).length,
      totalUsage,
      mostUsedMode: mostUsed?.mode.id,
    };
  }

  /**
   * Validate mode input before execution
   */
  async validateInput(modeId: string, input: any): Promise<{
    valid: boolean;
    errors?: string[];
  }> {
    // Get mode without incrementing usage count
    const entry = this.modes.get(modeId);
    if (!entry) {
      throw new ModeNotFoundError(modeId);
    }

    if (!entry.enabled) {
      throw new ModeError(
        `Mode is disabled: ${modeId}`,
        'MODE_DISABLED',
        { modeId }
      );
    }

    const mode = entry.mode;

    try {
      // Schema validation
      mode.inputSchema.parse(input);

      // Custom validation if provided
      if (mode.validate) {
        return await mode.validate(input);
      }

      return { valid: true };
    } catch (error) {
      if (error instanceof Error) {
        return {
          valid: false,
          errors: [error.message],
        };
      }
      return {
        valid: false,
        errors: ['Unknown validation error'],
      };
    }
  }

  /**
   * Execute a mode with input
   */
  async execute(
    modeId: string,
    input: any,
    context: any
  ): Promise<any> {
    // Get mode without incrementing usage count (we'll do it once at the end)
    const entry = this.modes.get(modeId);
    if (!entry) {
      throw new ModeNotFoundError(modeId);
    }

    if (!entry.enabled) {
      throw new ModeError(
        `Mode is disabled: ${modeId}`,
        'MODE_DISABLED',
        { modeId }
      );
    }

    const mode = entry.mode;

    this.logger.info('Executing mode', {
      modeId,
      jobId: context.jobId,
      correlationId: context.correlationId,
    });

    try {
      // Validate input
      const validation = await this.validateInput(modeId, input);
      if (!validation.valid) {
        throw new ModeError(
          'Input validation failed',
          'VALIDATION_ERROR',
          { errors: validation.errors }
        );
      }

      // Execute mode
      const startTime = Date.now();
      const result = await mode.run(input, context);
      const duration = Date.now() - startTime;

      // Validate output
      mode.outputSchema.parse(result);

      // Transform output if transformer provided
      const finalResult = mode.transform 
        ? await mode.transform(result, input)
        : result;

      // Update usage tracking only once after successful execution
      entry.usageCount++;
      entry.lastUsed = new Date();

      this.logger.info('Mode execution completed', {
        modeId,
        jobId: context.jobId,
        duration,
      });

      return finalResult;
    } catch (error) {
      this.logger.error('Mode execution failed', {
        modeId,
        jobId: context.jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Clear all modes (mainly for testing)
   */
  clear(): void {
    this.modes.clear();
    this.logger.info('Registry cleared');
  }
}

// Global registry instance
export const modeRegistry = new ModeRegistry();
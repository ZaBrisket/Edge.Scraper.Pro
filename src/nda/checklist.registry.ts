import { EDGEWATER_CHECKLIST_V1_0, EDGEWATER_CHECKLIST_V1_1 } from './checklist.edgewater';
import type { Checklist, ReviewResult } from './types';
import { downgrade_1_1_to_1_0, upgrade_1_0_to_1_1 } from './migrations';

type RegistryEntry = {
  current: Checklist;
  versions: Record<string, Checklist>;
  migrations: Record<string, (input: ReviewResult) => ReviewResult>;
};

export const REGISTRY: Record<string, RegistryEntry> = {
  'edgewater-nda': {
    current: EDGEWATER_CHECKLIST_V1_1,
    versions: {
      '1.0.0': EDGEWATER_CHECKLIST_V1_0,
      '1.1.0': EDGEWATER_CHECKLIST_V1_1,
    },
    migrations: {
      '1.0.0->1.1.0': upgrade_1_0_to_1_1,
      '1.1.0->1.0.0': downgrade_1_1_to_1_0,
    },
  },
};

export function getChecklist(id: string, version?: string): Checklist {
  const entry = REGISTRY[id];
  if (!entry) {
    throw new Error(`Unknown checklist: ${id}`);
  }
  if (!version) return entry.current;
  const selected = entry.versions[version];
  if (!selected) {
    throw new Error(`Unknown checklist version ${version} for ${id}`);
  }
  return selected;
}

export function listChecklistVersions(id: string): string[] {
  const entry = REGISTRY[id];
  if (!entry) return [];
  return Object.keys(entry.versions).sort();
}

export function getMigration(id: string, from: string, to: string) {
  const entry = REGISTRY[id];
  if (!entry) return undefined;
  return entry.migrations[`${from}->${to}`];
}

export function pickVariant(docShaHex: string): 'A' | 'B' {
  const nibble = parseInt(docShaHex[docShaHex.length - 1], 16);
  return nibble % 2 === 0 ? 'A' : 'B';
}

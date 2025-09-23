import { EDGEWATER_CHECKLIST } from './checklist.edgewater';

export const REGISTRY = {
  'edgewater-nda': { current: EDGEWATER_CHECKLIST, migrations: {} }
};

export function pickVariant(docShaHex: string): 'A' | 'B' {
  const nibble = parseInt(docShaHex[docShaHex.length - 1], 16);
  return nibble % 2 === 0 ? 'A' : 'B';
}

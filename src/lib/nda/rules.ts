import fs from 'node:fs';
import path from 'node:path';
import type { Checklist } from './types';

let cached: Checklist | null = null;

export function loadChecklist(): Checklist {
  if (cached) return cached;
  const checklistPath = path.join(process.cwd(), 'public', 'nda', 'checklist', 'edgewater.json');
  const raw = fs.readFileSync(checklistPath, 'utf8');
  cached = JSON.parse(raw) as Checklist;
  return cached;
}

import type { ReviewResult } from './types';

export function upgrade_1_0_to_1_1(prev: ReviewResult): ReviewResult {
  return {
    ...prev,
    checklistVersion: '1.1.0',
    variant: prev.variant || 'A',
    findings: prev.findings.map(f => ({
      ...f,
      notes: [...(f.notes || []), 'Upgraded from 1.0; re-review recommended.'],
    })),
  };
}

export function downgrade_1_1_to_1_0(cur: ReviewResult): ReviewResult {
  return {
    ...cur,
    checklistVersion: '1.0.0',
    findings: cur.findings.map(f => ({
      ...f,
      notes: [...(f.notes || []), 'Downgraded to 1.0; scores may vary.'],
    })),
  };
}

export function shouldReReview(a: string, b: string): boolean {
  const major = (v: string) => v.split('.')[0] || '1';
  return major(a) !== major(b);
}

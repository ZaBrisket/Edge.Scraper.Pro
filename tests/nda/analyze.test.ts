import { describe, expect, it } from 'vitest';
import { analyzeNdaText } from '../../src/lib/nda/analyze';

const SAMPLE = `
This Agreement is mutual. Each party shall maintain the confidentiality of the other's information.
“Confidential Information” does not include information that is publicly available without breach, already known, independently developed, or rightfully received from a third party.
Each party shall use best efforts to comply.
References to a party include its Affiliates and all current and future subsidiaries and assigns.
`;

describe('analyzeNdaText', () => {
  it('identifies risky clauses while respecting substantial compliance', () => {
    const result = analyzeNdaText(SAMPLE);
    const ids = result.issues.map((issue) => issue.ruleId);

    expect(ids).toContain('legal_modifiers');
    expect(ids).toContain('affiliate_language');

    const legal = result.issues.find((issue) => issue.ruleId === 'legal_modifiers');
    expect(legal?.severity ?? 0).toBeGreaterThanOrEqual(4);

    const carve = result.issues.find((issue) => issue.ruleId === 'confidential_info_carveouts');
    if (carve) {
      expect(carve.status).toBe('substantial');
    }
  });
});

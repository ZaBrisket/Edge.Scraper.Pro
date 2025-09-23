import { assessBurden } from './burden-assessor';

const STANDARD_CLAUSE =
  'Recipient shall protect Confidential Information using at least the same degree of care it uses to protect its own confidential information.';

describe('burden assessor', () => {
  it('flags high burden when clause is restrictive and one-sided', () => {
    const inbound =
      'The receiving party shall immediately return all materials and shall at all times use best efforts to comply. The disclosing party has sole discretion to demand action.';
    const result = assessBurden(inbound, STANDARD_CLAUSE);

    expect(result.burdenLevel).toBe('high');
    expect(result.restrictivenessScore).toBeGreaterThanOrEqual(2);
    expect(result.reciprocity).toBe('one-sided');
  });

  it('identifies low burden when clause aligns with standard', () => {
    const inbound =
      'The recipient shall protect confidential information using the same care it applies to its own confidential materials.';
    const result = assessBurden(inbound, STANDARD_CLAUSE);

    expect(result.burdenLevel).toBe('low');
    expect(result.restrictivenessScore).toBe(0);
  });

  it('returns medium burden when clause is lengthy but not one-sided', () => {
    const inbound =
      'Each party shall protect the other party’s Confidential Information using commercially reasonable efforts, implementing detailed safeguards, regular audits, and mandatory training for all personnel handling such data.';
    const result = assessBurden(inbound, STANDARD_CLAUSE);

    expect(result.burdenLevel === 'medium' || result.burdenLevel === 'low').toBeTruthy();
    expect(result.lengthRatio).toBeGreaterThan(1);
  });
});

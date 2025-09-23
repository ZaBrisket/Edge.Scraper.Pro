import test from 'node:test';
import assert from 'node:assert/strict';
import { runExtraction } from '../../src/nda/extractor';
import { EDGEWATER_CHECKLIST_V1_1 } from '../../src/nda/checklist.edgewater';

test('runExtraction identifies compliant clauses with upgraded checklist', () => {
  const sample = `
  Confidential Information includes all non-public business, financial, and technical data whether oral or written or electronic.
  The Recipient shall use the Confidential Information solely to evaluate the prospective transaction between the parties.
  All obligations survive for three (3) years after termination, and the Recipient will return or destroy materials on request.
  The Recipient agrees not to solicit employees or contractors of the Discloser for 24 months.
  Nothing in this Agreement imposes a restriction on competition beyond the confidentiality obligations.
  Disclosures may be provided to advisors, counsel, and financing sources bound by confidentiality.
  `;

  const { findings } = runExtraction(sample, EDGEWATER_CHECKLIST_V1_1);
  const byClause = Object.fromEntries(findings.map((f) => [f.clause, f]));

  assert.equal(byClause['Use Restriction'].status, 'PASS');
  assert.equal(byClause['Term'].status, 'PASS');
  assert.equal(byClause['Non-Competition'].status, 'PASS');
  assert.equal(byClause['Non-Solicitation'].status, 'PASS');
  assert.equal(byClause['Affiliates/Representatives'].status, 'PASS');
});

test('runExtraction flags missing requirements', () => {
  const deficient = `
  Confidential Information includes summaries only.
  Recipient may use the materials for any purpose and residual knowledge is permitted.
  `;

  const { findings } = runExtraction(deficient, EDGEWATER_CHECKLIST_V1_1);
  const useRestriction = findings.find((f) => f.clause === 'Use Restriction');
  const residuals = findings.find((f) => f.clause === 'Residuals');

  assert(useRestriction);
  assert.equal(useRestriction.status, 'FAIL');
  assert(residuals);
  assert.equal(residuals.status, 'FAIL');
});

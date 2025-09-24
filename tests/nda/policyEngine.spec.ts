import Engine from "../../src/services/nda/policyEngine";

const SAMPLE_TEXT_EQUIV_CARVEOUT = `
Confidential Information means all non-public information. However, Confidential Information excludes information that (i) was publicly available prior to its disclosure to us, (ii) was known to us prior to its disclosure to us and was not received under obligations of confidentiality, (iii) was independently developed by us or (iv) is or becomes available to us on a nonconfidential basis from a source not bound by confidentiality.
`;

const SAMPLE_TEXT_OVERBROAD_AFFILIATES = `
Your affiliates, portfolio companies and all related entities shall immediately be deemed Representatives under this Agreement, regardless of whether they receive any Evaluation Material.
`;

describe("policyEngine.analyze", () => {
it("proposes no wholesale replacement for materially-equivalent carve-outs; at most light modifiers", () => {
  const res = Engine.analyze(SAMPLE_TEXT_EQUIV_CARVEOUT);
  const ciSuggestions = res.suggestions.filter(s => s.clauseType === "Confidential Information Carve-Out");
  expect(ciSuggestions.length === 0 || ciSuggestions.every(s => s.delta?.summary.includes("Light"))).toBe(true);
});

it("suggests scoping overbroad affiliates per checklist", () => {
  const res = Engine.analyze(SAMPLE_TEXT_OVERBROAD_AFFILIATES);
  const aff = res.suggestions.find(s => s.clauseType === "Affiliate Language");
  expect(aff).toBeTruthy();
  expect(aff?.rationale.toLowerCase()).toContain("carve-out");
});

it("applies selected suggestions and emits html diff", () => {
  const text = "The term shall be thirty (30) months.";
  const analysis = Engine.analyze(text);
  const termSuggestion = analysis.suggestions.find(s => s.clauseType === "Term");
  expect(termSuggestion).toBeTruthy();
  const applied = Engine.apply(analysis.normalizedText, termSuggestion ? [termSuggestion] : []);
  expect(applied.text).toMatch(/twenty-four \(24\) months/);
  expect(applied.htmlDiff).toContain("<ins>");
});
});

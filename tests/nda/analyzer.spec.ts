import { describe, it, expect } from "vitest";
import { analyzeNDA } from "../../src/nda/analyzer";
import { loadDefaultChecklist } from "../../src/nda/checklist";

describe("NDA analyzer", () => {
  it("flags missing carve-outs and overbroad non-solicit", () => {
    const txt = `
      Non-Solicitation. For twenty-four (24) months, neither party will solicit employees of the other party.
      Confidentiality. Recipient shall not disclose Discloser's information.
    `;
    const res = analyzeNDA(txt, loadDefaultChecklist());
    const ids = res.issues.map((i) => i.provisionId);
    expect(ids).toContain("employee-non-solicit");
    expect(ids).toContain("confidential-carveouts");
    const nonSolicit = res.issues.find((i) => i.provisionId === "employee-non-solicit")!;
    expect(nonSolicit.severity).toBeGreaterThan(0.5);
  });

  it("skips edits when substantially compliant", () => {
    const txt = `
      During the Term and for 12 months thereafter, neither party will solicit any executive-level employee of the other party; general solicitation not specifically targeted does not violate this section.
      Confidential Information does not include information that is publicly available, already known, independently developed, or rightfully received from a third party.
    `;
    const res = analyzeNDA(txt, loadDefaultChecklist());
    expect(res.issues.length).toBeLessThan(2);
  });
});

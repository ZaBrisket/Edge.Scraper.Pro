import type {
  AnalysisResult,
  ChecklistProvision,
  EdgewaterChecklist,
  SuggestedEdit
} from "./types";

export function analyzeNDA(text: string, checklist: EdgewaterChecklist): AnalysisResult {
  const issues: SuggestedEdit[] = [];
  const lc = text.toLowerCase();

  const pushIssue = (
    prov: ChecklistProvision,
    original: string,
    suggested: string,
    reason: string,
    severity: number
  ) => {
    const idx = original ? lc.indexOf(original.toLowerCase()) : -1;
    issues.push({
      id: `${prov.id}-${issues.length + 1}`,
      provisionId: prov.id as any,
      originalText: original,
      suggestedText: suggested,
      reason,
      severity: Math.max(0, Math.min(1, severity)),
      start: idx >= 0 ? idx : undefined,
      end: idx >= 0 ? idx + original.length : undefined
    });
  };

  for (const prov of checklist.provisions) {
    // Find closest clause candidate by fuzzy search around baseline cues
    const candidate = findClauseCandidate(text, prov);
    if (!candidate) {
      if (prov.required) {
        pushIssue(
          prov,
          "",
          prov.baseline,
          `${prov.title}: missing required clause`,
          0.9
        );
      }
      continue;
    }

    // Context-aware acceptance: do not suggest changes if substantially compliant
    const similarity = tokenSimilarity(candidate, prov.baseline);
    const includesAccept = prov.acceptIfIncludes.every((phrase) =>
      candidate.toLowerCase().includes(phrase.toLowerCase())
    );
    const missingMusts = prov.mustContain.filter((k) =>
      !candidate.toLowerCase().includes(k.toLowerCase())
    );

    if (includesAccept && similarity >= 0.58 && missingMusts.length === 0) {
      // Substantially meets requirements → skip edit
      continue;
    }

    // Provision-specific logic
    switch (prov.id) {
      case "employee-non-solicit": {
        const overbroad =
          /(employee|personnel|contractor)s?\s+of\s+the\s+other\s+party/i.test(candidate) &&
          !/executive/i.test(candidate);
        const durationHi = /(18|24|2[0-9])\s*(months?|mo|m)/i.test(candidate);
        const severity = Math.min(
          1,
          (missingMusts.length > 0 ? prov.weights["missing-core"] : 0) +
            (overbroad ? prov.weights["overbroad-scope"] : 0) +
            (durationHi ? prov.weights["duration-high"] : 0)
        );
        const suggested = suggestEmployeeNonSolicit(candidate);
        pushIssue(
          prov,
          candidate,
          suggested,
          overbroad
            ? "Scope limited to executive-level + safe harbor for general solicitations"
            : "Align to baseline wording",
          Math.max(0.35, severity)
        );
        break;
      }
      case "confidential-carveouts": {
        const missing = ["public", "known", "independently", "third"].filter((k) =>
          !candidate.toLowerCase().includes(k)
        );
        if (missing.length === 0 && similarity >= 0.78) break;
        const severity = Math.min(
          1,
          prov.weights["missing-carveout"] * (missing.length / 4)
        );
        const suggested = ensureCarveOuts(candidate);
        pushIssue(
          prov,
          candidate,
          suggested,
          `Add standard carve-outs: ${missing.join(", ")}`,
          Math.max(0.4, severity)
        );
        break;
      }
      case "affiliate-scope": {
        const overbroad =
          /affiliat/i.test(candidate) &&
          /(all|any)\s+affiliates/i.test(candidate) &&
          !/solely as necessary|necessary\s+for\s+performance/i.test(candidate);
        if (!overbroad) break;
        const suggested = candidate.replace(
          /affiliates/gi,
          "Affiliates solely as necessary for performance"
        );
        pushIssue(
          prov,
          candidate,
          suggested,
          "Limit Affiliate scope",
          Math.max(0.5, prov.weights["overbroad-scope"])
        );
        break;
      }
      case "efforts-modifier": {
        if (
          /best\s+efforts/i.test(candidate) &&
          !/commercially\s+reasonable\s+efforts/i.test(candidate)
        ) {
          const suggested = candidate.replace(
            /best\s+efforts/gi,
            "commercially reasonable efforts"
          );
          pushIssue(
            prov,
            candidate,
            suggested,
            "Use commercially reasonable efforts",
            prov.weights["modifier-strength"]
          );
        }
        break;
      }
    }
  }

  return {
    textPreview: text.slice(0, 1000),
    issues,
    stats: {
      chars: text.length,
      words: text.split(/\s+/).filter(Boolean).length,
      detectedClauses: issues.length
    }
  };
}

// Find a reasonable clause candidate around key cue words
function findClauseCandidate(text: string, prov: ChecklistProvision): string | null {
  const lc = text.toLowerCase();
  const cues = [
    ...prov.mustContain,
    ...prov.acceptIfIncludes.map((s) => s.split(" ")[0])
  ].filter(Boolean);
  let best: { span: string; score: number } | null = null;
  for (const c of cues) {
    const i = lc.indexOf(c.toLowerCase());
    if (i >= 0) {
      const start = Math.max(0, i - 200);
      const end = Math.min(text.length, i + 200);
      const windowText = text.slice(start, end);
      const local = windowText.toLowerCase();
      const localIdx = local.indexOf(c.toLowerCase());
      let span = windowText;
      if (localIdx >= 0) {
        const lineStart = Math.max(
          local.lastIndexOf("\n", localIdx),
          local.lastIndexOf(".", localIdx)
        );
        const lineEndCandidates = [
          local.indexOf("\n", localIdx),
          local.indexOf(".", localIdx)
        ].filter((v) => v >= 0);
        const lineEnd = lineEndCandidates.length
          ? Math.min(...lineEndCandidates)
          : -1;
        span = windowText.slice(
          lineStart >= 0 ? lineStart + 1 : 0,
          lineEnd >= 0 ? lineEnd + 1 : windowText.length
        );
      }
      const score = tokenSimilarity(span, prov.baseline);
      if (!best || score > best.score) best = { span: span.trim(), score };
    }
  }
  return best?.span || null;
}

function tokenSimilarity(a: string, b: string): number {
  const A = new Set(
    a
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
  const B = new Set(
    b
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
  const inter = new Set([...A].filter((x) => B.has(x))).size;
  const union = new Set([...A, ...B]).size || 1;
  return inter / union;
}

function suggestEmployeeNonSolicit(_clause: string): string {
  return "During the Term and for twelve (12) months thereafter, neither party will, directly or indirectly, solicit for employment any executive-level employee of the other party with whom it had contact in connection with this Agreement; provided that general solicitations not specifically targeted shall not violate this section.";
}

function ensureCarveOuts(_clause: string): string {
  return "“Confidential Information” does not include information that is (a) publicly available without breach, (b) already known without restriction before disclosure, (c) independently developed without use of the discloser’s Confidential Information, or (d) rightfully received from a third party without duty of confidentiality.";
}

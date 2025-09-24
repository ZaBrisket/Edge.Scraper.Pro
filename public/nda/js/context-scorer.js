// Context-aware severity scoring for NDA provisions

/**
 * Calculate context score for a provision based on inbound language quality
 * @param {Object} result - Evaluation result for a provision
 * @param {string} fullText - Full NDA text
 * @param {Object} playbook - Playbook configuration
 * @returns {Object} Context score with explanation
 */
export function calculateContextScore(result, fullText, playbook) {
  const score = {
    score: 0,
    substantialCompliance: false,
    reasons: [],
    adjustments: []
  };
  
  // Skip if provision passed
  if (result.status === 'pass') {
    score.score = 10;
    score.substantialCompliance = true;
    return score;
  }
  
  // Analyze based on provision type
  switch (result.id) {
    case 'non_solicit':
      return scoreNonSolicit(result, fullText);
      
    case 'term_cap':
      return scoreTermCap(result, fullText);
      
    case 'govlaw_ca_party_prefers_ca':
      return scoreGovLaw(result, fullText);
      
    case 'equitable_relief':
      return scoreEquitableRelief(result, fullText);
      
    case 'return_destroy':
      return scoreReturnDestroy(result, fullText);
      
    case 'mutuality':
      return scoreMutuality(result, fullText);
      
    case 'residuals':
      return scoreResiduals(result, fullText);
      
    default:
      return scoreGeneric(result, fullText);
  }
}

function scoreNonSolicit(result, fullText) {
  const score = {
    score: 0,
    substantialCompliance: false,
    reasons: [],
    adjustments: []
  };
  
  // Check if limited to executives only
  const execOnlyPattern = /non[- ]?solicit.*(?:executive|officer|director|senior|C-level|management)/i;
  const generalNonSolicit = /non[- ]?solicit/i;
  
  if (execOnlyPattern.test(fullText)) {
    score.score = 7;
    score.reasons.push("Non-solicit limited to executives only");
    score.adjustments.push("Consider acceptable if limited to senior roles");
    
    // Check duration
    const durationPattern = /non[- ]?solicit.*?(\d+)\s*(months?|years?)/i;
    const match = fullText.match(durationPattern);
    if (match) {
      const duration = parseInt(match[1], 10);
      const unit = (match[2] || '').toLowerCase();
      
      if (unit.includes('month') && duration <= 12) {
        score.score = 8;
        score.substantialCompliance = true;
        score.reasons.push(`Duration limited to ${duration} months`);
      } else if (unit.includes('year') && duration <= 1) {
        score.score = 8;
        score.substantialCompliance = true;
        score.reasons.push("Duration limited to 1 year");
      }
    }
  } else if (generalNonSolicit.test(fullText)) {
    score.score = 3;
    score.reasons.push("Broad non-solicit provision found");
    score.adjustments.push("Requires narrowing to executives or removal");
  }
  
  return score;
}

function scoreTermCap(result, fullText) {
  const score = {
    score: 0,
    substantialCompliance: false,
    reasons: [],
    adjustments: []
  };
  
  // Extract term duration
  const termPattern = /confidential.*(?:term|period|duration).*?(\d+)\s*(years?|months?)/i;
  const perpetualPattern = /perpetual|indefinite|in\s+perpetuity/i;
  
  if (perpetualPattern.test(fullText)) {
    score.score = 0;
    score.reasons.push("Perpetual confidentiality term");
    score.adjustments.push("Must be limited to 2-3 years");
  } else {
    const match = fullText.match(termPattern);
    if (match) {
      const duration = parseInt(match[1], 10);
      const unit = (match[2] || '').toLowerCase();
      
      if (unit.includes('year')) {
        if (duration <= 2) {
          score.score = 10;
          score.substantialCompliance = true;
          score.reasons.push(`Term already limited to ${duration} years`);
        } else if (duration === 3) {
          score.score = 8;
          score.substantialCompliance = true;
          score.reasons.push("Term at 3 years - acceptable");
        } else {
          score.score = 4;
          score.reasons.push(`Term too long at ${duration} years`);
          score.adjustments.push("Reduce to 2-3 years");
        }
      }
    }
  }
  
  // Check for trade secret carve-out
  if (/trade\s+secret.*(?:longer|perpetual|indefinite)/i.test(fullText)) {
    score.score = Math.min(10, score.score + 2);
    score.reasons.push("Trade secret carve-out present");
  }
  
  return score;
}

function scoreGovLaw(result, fullText) {
  const score = {
    score: 5,
    substantialCompliance: false,
    reasons: [],
    adjustments: []
  };
  
  // Check current governing law
  const govLawPattern = /govern.*(?:law|laws).*(?:of|by)\s*(?:the\s+)?(?:State\s+of\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;
  const match = fullText.match(govLawPattern);
  
  if (match) {
    const state = match[1];
    
    // Acceptable alternatives to California
    const acceptableStates = ['Delaware', 'New York', 'Nevada'];
    
    if (state.includes('California')) {
      score.score = 10;
      score.substantialCompliance = true;
      score.reasons.push("Already uses California law");
    } else if (acceptableStates.some(s => state.includes(s))) {
      score.score = 8;
      score.substantialCompliance = true;
      score.reasons.push(`${state} law is business-friendly alternative`);
    } else {
      score.score = 4;
      score.reasons.push(`Uses ${state} law`);
      score.adjustments.push("Consider negotiating to CA, DE, or NY");
    }
  }
  
  return score;
}

function scoreEquitableRelief(result, fullText) {
  const score = {
    score: 0,
    substantialCompliance: false,
    reasons: [],
    adjustments: []
  };
  
  const equitablePattern = /(?:injunctive|equitable)\s+relief/i;
  const irreparableHarmPattern = /irreparable\s+(?:harm|damage|injury)/i;
  const adequateRemedyPattern = /(?:no\s+)?adequate.*(?:remedy|relief).*law/i;
  
  let points = 0;
  
  if (equitablePattern.test(fullText)) {
    points += 4;
    score.reasons.push("Equitable relief provision present");
  }
  
  if (irreparableHarmPattern.test(fullText)) {
    points += 3;
    score.reasons.push("Irreparable harm acknowledged");
  }
  
  if (adequateRemedyPattern.test(fullText)) {
    points += 3;
    score.reasons.push("No adequate remedy at law acknowledged");
  }
  
  score.score = Math.min(10, points);
  
  if (score.score >= 7) {
    score.substantialCompliance = true;
    score.adjustments.push("Provision substantially meets requirements");
  } else if (score.score >= 4) {
    score.adjustments.push("Consider adding missing elements");
  } else {
    score.adjustments.push("Add comprehensive equitable relief provision");
  }
  
  return score;
}

function scoreReturnDestroy(result, fullText) {
  const score = {
    score: 0,
    substantialCompliance: false,
    reasons: [],
    adjustments: []
  };
  
  const returnDestroyPattern = /(?:return|destroy|delete).*(?:confidential|information|material|document)/i;
  const uponRequestPattern = /upon\s+(?:request|demand|notice)/i;
  const terminationPattern = /(?:upon|at|following)\s+termination/i;
  const certificationPattern = /certif(?:y|ication).*(?:destruction|deletion|return)/i;
  
  let points = 0;
  
  if (returnDestroyPattern.test(fullText)) {
    points += 4;
    score.reasons.push("Return/destroy provision present");
    
    if (uponRequestPattern.test(fullText)) {
      points += 3;
      score.reasons.push("Triggered upon request");
    }
    
    if (terminationPattern.test(fullText)) {
      points += 2;
      score.reasons.push("Triggered at termination");
    }
    
    if (certificationPattern.test(fullText)) {
      points += 1;
      score.reasons.push("Certification requirement included");
    }
  }
  
  score.score = Math.min(10, points);
  
  if (score.score >= 7) {
    score.substantialCompliance = true;
    score.adjustments.push("Return/destroy provisions adequate");
  } else if (score.score >= 4) {
    score.adjustments.push("Strengthen return/destroy triggers");
  } else {
    score.adjustments.push("Add comprehensive return/destroy provision");
  }
  
  return score;
}

function scoreMutuality(result, fullText) {
  const score = {
    score: 0,
    substantialCompliance: false,
    reasons: [],
    adjustments: []
  };
  
  const mutualPattern = /mutual|bilateral|each\s+party|both\s+parties/i;
  const oneWayPattern = /one[- ]way|unilateral|discloser.*recipient/i;
  
  if (mutualPattern.test(fullText)) {
    // Check if truly mutual
    const obligationPattern = /each\s+party.*(?:shall|will|must).*(?:keep|maintain|protect).*confidential/i;
    
    if (obligationPattern.test(fullText)) {
      score.score = 10;
      score.substantialCompliance = true;
      score.reasons.push("Fully mutual obligations confirmed");
    } else {
      score.score = 6;
      score.reasons.push("Mutual language present but needs verification");
      score.adjustments.push("Verify both parties have equal obligations");
    }
  } else if (oneWayPattern.test(fullText)) {
    score.score = 0;
    score.reasons.push("One-way NDA detected");
    score.adjustments.push("Convert to mutual NDA");
  } else {
    score.score = 3;
    score.reasons.push("Mutuality unclear");
    score.adjustments.push("Clarify mutual obligations");
  }
  
  return score;
}

function scoreResiduals(result, fullText) {
  const score = {
    score: 0,
    substantialCompliance: false,
    reasons: [],
    adjustments: []
  };
  
  const residualsPattern = /residual|unaided\s+memory|retained\s+knowledge|general\s+(?:skill|knowledge|know-how)/i;
  const narrowPattern = /residual.*(?:limited|except|excluding|not\s+including).*(?:specific|detailed|proprietary)/i;
  
  if (!residualsPattern.test(fullText)) {
    score.score = 10;
    score.substantialCompliance = true;
    score.reasons.push("No problematic residuals clause");
  } else if (narrowPattern.test(fullText)) {
    score.score = 6;
    score.reasons.push("Residuals clause present but narrowly limited");
    score.adjustments.push("Consider if limitations are sufficient");
  } else {
    score.score = 0;
    score.reasons.push("Broad residuals clause detected");
    score.adjustments.push("Remove or significantly narrow residuals language");
  }
  
  return score;
}

function scoreGeneric(result, fullText) {
  // Default scoring for provisions without specific logic
  return {
    score: result.status === 'pass' ? 10 : 5,
    substantialCompliance: false,
    reasons: [`Generic evaluation for ${result.title}`],
    adjustments: [result.recommendation]
  };
}

/**
 * Compare inbound language against Edgewater requirements
 * @param {string} inboundText - Text from the provision
 * @param {Array} requirements - Required patterns/text
 * @returns {number} Compliance percentage (0-100)
 */
export function calculateCompliancePercentage(inboundText, requirements) {
  if (!requirements || requirements.length === 0) return 100;
  
  let matched = 0;
  
  for (const req of requirements) {
    if (typeof req === 'string') {
      if (inboundText.toLowerCase().includes(req.toLowerCase())) {
        matched++;
      }
    } else if (req instanceof RegExp) {
      if (req.test(inboundText)) {
        matched++;
      }
    }
  }
  
  return Math.round((matched / requirements.length) * 100);
}

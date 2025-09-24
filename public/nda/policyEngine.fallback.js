// Fallback NDA Policy Engine - provides minimal functionality when main engine fails to load
(function(){
  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function(char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function escapeRegex(value) {
    return String(value).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  function snippet(text, index) {
    var start = Math.max(0, index - 40);
    var end = Math.min(text.length, index + 40);
    return text.slice(start, end).trim();
  }

  function buildCoverage(text) {
    var sections = [
      { key: 'Confidentiality', regex: /\b(confidential|proprietary|non-disclosure)\b/i, presentNote: 'Confidentiality language detected.', missingNote: 'No explicit confidentiality clause located.' },
      { key: 'Term', regex: /\b(term|duration|period|expires?|years?)\b/i, presentNote: 'Term or duration language detected.', missingNote: 'No explicit duration language located.' },
      { key: 'Governing Law', regex: /\b(governing law|jurisdiction|venue|courts?)\b/i, presentNote: 'Governing law / venue language detected.', missingNote: 'No governing law clause detected.' },
      { key: 'Indemnification', regex: /\b(indemnif|hold harmless|defend)\b/i, presentNote: 'Indemnification phrasing detected.', missingNote: 'No indemnification language located.' },
      { key: 'Limitation of Liability', regex: /\b(limitation|liability|damages|consequential)\b/i, presentNote: 'Liability limitation language detected.', missingNote: 'No limitation of liability clause found.' }
    ];

    var coverage = {};
    sections.forEach(function(section){
      var present = section.regex.test(text);
      coverage[section.key] = {
        ok: present,
        note: present ? section.presentNote : section.missingNote
      };
    });
    return coverage;
  }

  function analyze(text) {
    text = String(text || '');
    console.warn('[NDAPolicyEngine] Using fallback engine - full analysis unavailable');

    var issues = [];

    var bestEffortsPattern = /(best\s+efforts)/i;
    var bestEffortsMatch = bestEffortsPattern.exec(text);
    if (bestEffortsMatch) {
      issues.push({
        id: 'fb-best-efforts',
        severity: 60,
        clauseType: 'Obligations',
        title: 'Clarify efforts standard',
        rationale: 'Replace "best efforts" with "commercially reasonable efforts" to avoid unbounded obligations.',
        proposal: { replacement: 'commercially reasonable efforts' },
        delta: { summary: 'Swap "best efforts" for "commercially reasonable efforts".' },
        context: snippet(text, bestEffortsMatch.index),
        meta: { pattern: '(best\\s+efforts)', flags: 'gi', replacement: 'commercially reasonable efforts' }
      });
    }

    var perpetualPattern = /(perpetual|indefinite)/i;
    var perpetualMatch = perpetualPattern.exec(text);
    if (perpetualMatch) {
      issues.push({
        id: 'fb-term-perpetual',
        severity: 80,
        clauseType: 'Term',
        title: 'Review perpetual term language',
        rationale: 'Perpetual or indefinite term detected. Consider defining a fixed term with renewal / termination rights.',
        proposal: { replacement: 'a defined term (e.g., 2 years) with renewal rights' },
        delta: { summary: 'Replace "' + perpetualMatch[0] + '" with a specific duration or termination construct.' },
        context: snippet(text, perpetualMatch.index),
        meta: { pattern: '(perpetual|indefinite)', flags: 'gi', replacement: 'a defined term (e.g., 2 years)' }
      });
    }

    var coverage = buildCoverage(text);
    var score = Math.max(0, 100 - (issues.length * 10));

    return {
      suggestions: issues,
      issues: issues,
      score: score,
      checklistCoverage: coverage
    };
  }

  function apply(originalText, suggestions) {
    var text = String(originalText || '');
    var html = escapeHtml(text);
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return { text: text, htmlDiff: html };
    }

    var updatedText = text;
    var replacements = [];

    suggestions.forEach(function(suggestion){
      if (!suggestion || !suggestion.meta) return;
      var meta = suggestion.meta;
      if (!meta.pattern || !meta.replacement) return;
      var flags = meta.flags || 'gi';
      var pattern;
      try {
        pattern = new RegExp(meta.pattern, flags);
      } catch (err) {
        console.warn('[NDAPolicyEngine:fallback] Invalid replacement pattern', err);
        return;
      }
      pattern.lastIndex = 0;
      var match = pattern.exec(updatedText);
      if (!match) return;
      var before = match[0];
      updatedText = updatedText.slice(0, match.index) + meta.replacement + updatedText.slice(match.index + before.length);
      replacements.push({ before: before, after: meta.replacement });
    });

    if (replacements.length) {
      replacements.forEach(function(change){
        var escaped = escapeRegex(change.before);
        var pattern = new RegExp(escaped, 'g');
        html = html.replace(pattern, function(){
          return '<del>' + escapeHtml(change.before) + '</del><ins>' + escapeHtml(change.after) + '</ins>';
        });
      });
    } else {
      html = escapeHtml(updatedText);
    }

    return { text: updatedText, htmlDiff: html };
  }

  window.NDAPolicyEngine = { analyze: analyze, apply: apply };
  window.NDA_ENV = window.NDA_ENV || { MAX_DOCX_MB: 5 };
})();

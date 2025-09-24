window.NDAPolicyEngine = {
  analyze: function(text) {
    return {
      suggestions: [],
      issues: [],
      score: 100,
      checklist: { covered: [], missing: [] }
    };
  }
};

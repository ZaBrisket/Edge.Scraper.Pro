// Quick verification script to run in browser console
(function() {
  const tests = [
    {
      name: 'Engine loaded',
      check: () => typeof window.StandardizationEngineV2 !== 'undefined'
    },
    {
      name: 'Dependencies present',
      check: () => window.Papa && window.XLSX
    },
    {
      name: 'DOM elements exist',
      check: () => document.getElementById('std-file-input') !== null
    },
    {
      name: 'Fluff removal works',
      check: () => {
        const test = 'A leading innovative world-class company';
        const cleaned = window.StandardizationEngineV2._utils.stripPatterns(test);
        return !cleaned.includes('leading') && !cleaned.includes('innovative');
      }
    },
    {
      name: 'Word limit enforced',
      check: () => {
        const long = Array(50).fill('word').join(' ');
        const limited = window.StandardizationEngineV2._utils.enforceWordLimit(long);
        return limited.split(' ').length <= 30;
      }
    }
  ];

  console.log('=== Standardization Verification ===');
  tests.forEach(test => {
    try {
      const result = test.check();
      console.log(`${result ? '✅' : '❌'} ${test.name}`);
    } catch (e) {
      console.log(`❌ ${test.name}: ${e.message}`);
    }
  });
})();
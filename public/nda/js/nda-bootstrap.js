(function(){
  if (typeof document === 'undefined') {
    return;
  }

  var primary = document.createElement('script');
  primary.src = '/nda/policyEngine.browser.js';
  primary.async = false;
  primary.onerror = function () {
    if (typeof window !== 'undefined' && !window.NDAPolicyEngine) {
      var fallback = document.createElement('script');
      fallback.src = '/nda/policyEngine.fallback.js';
      fallback.async = false;
      document.head.appendChild(fallback);
    }
  };
  document.head.appendChild(primary);
})();

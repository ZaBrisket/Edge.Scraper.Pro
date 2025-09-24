(function() {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  ready(() => {
    const namespace = window.EdgeComponents || {};

    document.querySelectorAll('[data-component="navigation"]').forEach(node => {
      const active = node.getAttribute('data-active');
      if (typeof namespace.renderNavigation === 'function') {
        namespace.renderNavigation(node, active);
      }
    });

    document.querySelectorAll('[data-component="error"]').forEach(node => {
      if (typeof namespace.mountErrorHandler === 'function') {
        namespace.mountErrorHandler(node);
      }
    });
  });
})();

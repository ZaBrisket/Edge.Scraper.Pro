(function() {
  'use strict';

  const ERROR_CLASS = 'error-banner';

  function ensureContainer(root) {
    if (!root) {
      return null;
    }

    if (!root.classList.contains(ERROR_CLASS)) {
      root.classList.add(ERROR_CLASS);
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'assertive');
      root.setAttribute('tabindex', '-1');
      root.hidden = true;
    }

    return root;
  }

  function showError(root, message) {
    const container = ensureContainer(root);
    if (!container) {
      return;
    }

    container.textContent = message;
    container.hidden = false;
    container.focus({ preventScroll: false });
  }

  function clearError(root) {
    const container = ensureContainer(root);
    if (!container) {
      return;
    }

    container.hidden = true;
    container.textContent = '';
  }

  window.EdgeComponents = window.EdgeComponents || {};
  window.EdgeComponents.mountErrorHandler = ensureContainer;
  window.EdgeComponents.showError = showError;
  window.EdgeComponents.clearError = clearError;
})();

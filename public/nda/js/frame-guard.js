(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FrameGuard = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getBaseUrl() {
    if (typeof window !== 'undefined' && window.location) {
      return window.location.href;
    }
    return 'http://localhost';
  }

  function normalizeOrigin(value) {
    if (!value || typeof value !== 'string') {
      return null;
    }

    try {
      var url = new URL(value, getBaseUrl());
      if (!/^https?:$/.test(url.protocol)) {
        return null;
      }
      if (url.username || url.password) {
        return null;
      }
      return url.origin;
    } catch (err) {
      return null;
    }
  }

  function uniqueOrigins(list) {
    var seen = Object.create(null);
    var result = [];
    for (var i = 0; i < list.length; i += 1) {
      var origin = list[i];
      if (!origin || seen[origin]) {
        continue;
      }
      seen[origin] = true;
      result.push(origin);
    }
    return result;
  }

  function normalizeAllowlist(allowlist) {
    if (!Array.isArray(allowlist)) {
      return [];
    }
    var normalized = [];
    for (var i = 0; i < allowlist.length; i += 1) {
      var origin = normalizeOrigin(allowlist[i]);
      if (origin) {
        normalized.push(origin);
      }
    }
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      normalized.push(window.location.origin);
    }
    return uniqueOrigins(normalized);
  }

  function isAllowedReferrer(referrer, allowlist) {
    var normalizedAllowlist = normalizeAllowlist(allowlist);
    if (!referrer || typeof referrer !== 'string' || normalizedAllowlist.length === 0) {
      return false;
    }

    var origin = normalizeOrigin(referrer);
    if (!origin) {
      return false;
    }

    for (var i = 0; i < normalizedAllowlist.length; i += 1) {
      if (origin === normalizedAllowlist[i]) {
        return true;
      }
    }
    return false;
  }

  function renderBlock(origin) {
    if (typeof document === 'undefined') {
      return;
    }
    var doc = document;
    var container = doc.getElementById('main') || doc.body || doc.documentElement;
    if (!container) {
      return;
    }

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    var wrapper = doc.createElement('div');
    wrapper.setAttribute('role', 'alert');
    wrapper.setAttribute('data-frame-guard', 'blocked');
    wrapper.style.padding = '24px';
    wrapper.style.border = '1px solid #b91c1c';
    wrapper.style.background = '#fef2f2';
    wrapper.style.color = '#7f1d1d';
    wrapper.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    wrapper.style.maxWidth = '640px';
    wrapper.style.margin = '40px auto';

    var heading = doc.createElement('h2');
    heading.textContent = 'Embedding blocked';
    heading.style.marginTop = '0';

    var message = doc.createElement('p');
    message.textContent = 'This NDA Reviewer instance only allows approved parent origins. Access from "' + (origin || 'unknown origin') + '" was denied.';

    wrapper.appendChild(heading);
    wrapper.appendChild(message);
    container.appendChild(wrapper);

    if (doc.documentElement) {
      doc.documentElement.setAttribute('data-frame-blocked', 'true');
    }

    if (typeof window !== 'undefined' && typeof window.sendTelemetry === 'function') {
      try {
        window.sendTelemetry('iframe_blocked', { origin: origin || '' });
      } catch (err) {
        // ignore telemetry errors
      }
    }
  }

  function enforceFrameAncestors(allowlist, onBlock) {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return true;
    }

    var blockFn = typeof onBlock === 'function' ? onBlock : renderBlock;
    var normalizedAllowlist = normalizeAllowlist(allowlist);

    var isFramed = false;
    try {
      isFramed = window.top !== window.self;
    } catch (err) {
      isFramed = true;
    }
    if (!isFramed && window.__frameGuardTopStub) {
      isFramed = true;
    }

    if (!isFramed) {
      return true;
    }

    var referrer = document.referrer || '';
    if (!referrer) {
      blockFn('');
      return false;
    }

    if (!isAllowedReferrer(referrer, normalizedAllowlist)) {
      var origin = normalizeOrigin(referrer) || '';
      blockFn(origin);
      return false;
    }

    return true;
  }

  function readAllowlistFromBody() {
    if (typeof document === 'undefined') {
      return [];
    }
    var body = document.body;
    if (!body) {
      return [];
    }
    var attr = body.getAttribute('data-allowed-origins');
    if (!attr) {
      return [];
    }
    var parts = attr.split(',');
    var values = [];
    for (var i = 0; i < parts.length; i += 1) {
      var trimmed = parts[i].trim();
      if (trimmed) {
        values.push(trimmed);
      }
    }
    return values;
  }

  function autoEnforce() {
    var allowlist = readAllowlistFromBody();
    if (allowlist.length === 0) {
      return;
    }
    enforceFrameAncestors(allowlist);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoEnforce);
    } else {
      autoEnforce();
    }
  }

  return {
    isAllowedReferrer: isAllowedReferrer,
    enforceFrameAncestors: enforceFrameAncestors
  };
});

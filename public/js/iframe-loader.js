(function(){
  if (typeof document === 'undefined') {
    return;
  }

  function toNumber(value, fallback) {
    var parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) {
      return fallback;
    }
    return parsed;
  }

  function logEvent(appName, eventName, payload) {
    var data = payload || {};
    if (typeof console !== 'undefined' && console.log) {
      console.log('[IframeLoader]', appName, eventName, data);
    }
    if (typeof window !== 'undefined' && typeof window.sendTelemetry === 'function') {
      try {
        window.sendTelemetry('iframe_' + eventName, Object.assign({ app: appName }, data));
      } catch (err) {
        // ignore telemetry failures
      }
    }
  }

  function attachLoader(iframe) {
    if (!iframe || iframe.__iframeLoaderAttached) {
      return;
    }
    iframe.__iframeLoaderAttached = true;

    var appName = iframe.getAttribute('data-app-name') || iframe.getAttribute('title') || 'Embedded App';
    var maxRetries = toNumber(iframe.getAttribute('data-max-retries'), 3);
    var retryCount = 0;
    var retryTimer = null;

    function clearTimer() {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    }

    function getSource() {
      return iframe.getAttribute('data-src') || iframe.getAttribute('src') || '';
    }

    function setLoadingState() {
      iframe.setAttribute('data-loading', 'true');
      iframe.removeAttribute('data-error');
    }

    function reloadFrame() {
      var src = getSource();
      if (!src) {
        logEvent(appName, 'error', { reason: 'no_src_attribute' });
        return;
      }
      setLoadingState();
      logEvent(appName, 'retry', { attempt: retryCount, src: src });
      try {
        iframe.removeAttribute('src');
      } catch (err) {
        // ignore remove failures
      }
      iframe.setAttribute('src', src);
    }

    function handleLoad() {
      clearTimer();
      iframe.removeAttribute('data-loading');
      iframe.removeAttribute('data-error');
      logEvent(appName, 'loaded', { attempts: retryCount + 1 });
      retryCount = 0;
    }

    function handleError(event) {
      var errorMessage = '';
      if (event && event.message) {
        errorMessage = event.message;
      }
      logEvent(appName, 'error', { attempt: retryCount + 1, error: errorMessage || 'load_failed' });
      if (retryCount < maxRetries) {
        retryCount += 1;
        clearTimer();
        var delay = Math.min(5000, 1000 * retryCount);
        retryTimer = setTimeout(reloadFrame, delay);
      } else {
        clearTimer();
        iframe.setAttribute('data-error', 'true');
        iframe.removeAttribute('data-loading');
        logEvent(appName, 'failed', { totalAttempts: retryCount + 1 });
      }
    }

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);

    var initialSrc = getSource();
    if (initialSrc) {
      setLoadingState();
      logEvent(appName, 'init', { src: initialSrc });
    } else {
      logEvent(appName, 'error', { reason: 'no_src_attribute' });
    }

    if (typeof window !== 'undefined') {
      window.__iframeLoader = {
        app: appName,
        forceError: function () {
          handleError({ message: 'forced_error', manual: true });
        },
        getRetryCount: function () {
          return retryCount;
        }
      };
    }
  }

  function init() {
    var frames = document.querySelectorAll('iframe.app-frame');
    if (!frames || frames.length === 0) {
      return;
    }
    frames.forEach ? frames.forEach(attachLoader) : Array.prototype.forEach.call(frames, attachLoader);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

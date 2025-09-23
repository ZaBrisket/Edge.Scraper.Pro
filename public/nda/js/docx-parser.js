const DIAG_KEY = "__ndaDiagnostics";
let mammothReadyPromise = null;

/**
 * Parse DOCX to text using mammoth (browser build exposes window.mammoth).
 * Adds lightweight diagnostics so future regressions are easier to trace.
 * @param {Uint8Array} data
 * @param {(progress:number)=>void} [onProgress]
 * @returns {Promise<{text:string,pages:undefined}>}
 */
export async function parseDocx(data, onProgress = () => {}) {
  const diag = docxDiagnostics();
  diag.attempts = (diag.attempts || 0) + 1;
  diag.lastAttemptAt = new Date().toISOString();
  diag.lastByteLength = data?.byteLength ?? 0;
  console.debug("[NDA][DOCX] parseDocx attempt", diag.attempts, "bytes", diag.lastByteLength);

  if (typeof window === "undefined") {
    const err = new Error("DOCX parsing requires a browser environment.");
    diag.lastError = err.message;
    console.error("[NDA][DOCX]", err);
    throw err;
  }

  try {
    const mammoth = await ensureMammoth();
    onProgress(10);
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    onProgress(100);
    const text = normalize(value || "");
    diag.lastSuccessAt = new Date().toISOString();
    diag.lastError = undefined;
    console.debug("[NDA][DOCX] parseDocx success", { chars: text.length });
    return { text, pages: undefined };
  } catch (error) {
    const message = error?.message || String(error);
    diag.lastError = message;
    console.error("[NDA][DOCX] parseDocx failed", error);
    throw error;
  }
}

async function ensureMammoth() {
  const diag = docxDiagnostics();
  if (window?.mammoth?.extractRawText) {
    diag.mammothLoaded = true;
    diag.mammothReadyAt = diag.mammothReadyAt || new Date().toISOString();
    diag.mammothVersion = window.mammoth?.version || "unknown";
    return window.mammoth;
  }

  if (!mammothReadyPromise) {
    const script = document.querySelector('script[data-lib="mammoth"]');
    diag.loaderDetected = !!script;
    mammothReadyPromise = new Promise((resolve, reject) => {
      if (!script) {
        const err = new Error("Mammoth loader script tag not found on page.");
        diag.lastError = err.message;
        console.error("[NDA][DOCX]", err.message);
        mammothReadyPromise = null;
        reject(err);
        return;
      }

      const timeout = setTimeout(() => {
        fail(new Error("Timed out waiting for mammoth.js to initialize."));
      }, 10000);

      const cleanup = () => {
        clearTimeout(timeout);
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
      };

      const fail = (err, event) => {
        cleanup();
        diag.lastError = err.message;
        console.error("[NDA][DOCX]", err.message, event || "");
        mammothReadyPromise = null;
        reject(err);
      };

      const onLoad = () => {
        cleanup();
        if (window?.mammoth?.extractRawText) {
          diag.mammothLoaded = true;
          diag.mammothReadyAt = new Date().toISOString();
          diag.mammothVersion = window.mammoth?.version || "unknown";
          script.setAttribute("data-loaded", "true");
          resolve(window.mammoth);
        } else {
          fail(new Error("Mammoth script loaded but window.mammoth is undefined."));
        }
      };

      const onError = (event) => {
        fail(new Error("Failed to load mammoth.js from CDN."), event);
      };

      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
    });
  }

  return mammothReadyPromise;
}

export function whenMammothReady() {
  return ensureMammoth();
}

function docxDiagnostics() {
  if (typeof window === "undefined") return { attempts: 0 };
  const root = (window[DIAG_KEY] = window[DIAG_KEY] || {});
  root.docx = root.docx || {};
  return root.docx;
}

function normalize(s) {
  return String(s).replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s+\n/g, "\n").trim();
}

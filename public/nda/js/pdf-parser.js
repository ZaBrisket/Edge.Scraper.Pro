// PDF (machine-read) parsing via pdf.js (ESM build)
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.mjs";

/**
 * Extract text from a machine-readable PDF.
 * @param {Uint8Array} data
 * @param {(progress:number)=>void} [onProgress]
 * @returns {Promise<{text:string,pages:number}>}
 */
export async function parsePdf(data, onProgress = () => {}) {
  const loading = pdfjsLib.getDocument({ data });
  const pdf = await loading.promise;
  const totalPages = pdf.numPages;
  let text = "";
  for (let p = 1; p <= totalPages; p++) {
    onProgress(Math.round((p - 1) * 100 / totalPages));
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str || "").join(" ") + "\n";
    // Per-page cleanup to bound memory on large PDFs
    try { page.cleanup(); } catch {}
  }
  onProgress(100);
  // Terminate underlying worker to release resources
  try { await pdf.destroy(); } catch {}
  return { text: normalizeWhitespace(text), pages: totalPages };
}

/**
 * OCR a PDF using a Worker (see workers/ocr-worker.js).
 * @param {File} file
 * @param {Worker} worker
 * @param {(progress:number, message?:string)=>void} [onProgress]
 * @returns {Promise<{text:string,pages:number}>}
 */
export function ocrPdf(file, worker, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const onMsg = (e) => {
      const { type, payload } = e.data || {};
      if (type === "progress") onProgress(payload.percent || 0, payload.message);
      else if (type === "done") { onProgress(100, "Done"); cleanup(); resolve(payload); }
      else if (type === "error") { cleanup(); reject(new Error(payload.message || "OCR worker error")); }
    };
    const cleanup = () => {
      try { worker.removeEventListener("message", onMsg); } catch {}
      try { worker.terminate(); } catch {}
    };
    worker.addEventListener("message", onMsg);
    try {
      worker.postMessage({ file });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

function normalizeWhitespace(s) {
  return String(s).replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s+\n/g, "\n").trim();
}

export { parsePdf, ocrPdf };

// Module worker: OCR scanned PDFs using pdf.js + tesseract.js
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.mjs";
import { createWorker } from "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.3/tesseract.esm.min.js";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.mjs";

function post(type, payload){ self.postMessage({ type, payload }); }

self.onmessage = async (e) => {
  const { file } = e.data || {};
  if (!file) return post("error", { message: "No file received" });
  if (typeof OffscreenCanvas === "undefined") {
    post("error", { message: "OCR unavailable: OffscreenCanvas not supported in this environment." });
    return;
  }
  try {
    const out = await ocrPdfFile(file);
    post("done", out);
  } catch (err) {
    post("error", { message: err?.message || String(err) });
  }
};

async function ocrPdfFile(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const totalPages = pdf.numPages;

  // Single tesseract worker for entire document (best practice)
  const worker = await createWorker({ logger: (m) => {
    if (m?.status === "recognizing text" && typeof m.progress === "number") {
      post("progress", { percent: Math.round(m.progress * 100), message: "OCR…" });
    }
  }});
  await worker.load();
  await worker.loadLanguage("eng");
  await worker.initialize("eng");

  let textOut = "";
  for (let p = 1; p <= totalPages; p++) {
    post("progress", { percent: Math.round((p - 1) * 100 / totalPages), message: `Rendering page ${p}/${totalPages}` });
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await canvas.convertToBlob({ type: "image/png" });
    const bitmap = await createImageBitmap(blob);

    post("progress", { percent: Math.round((p - 0.3) * 100 / totalPages), message: `OCR page ${p}` });
    const { data } = await worker.recognize(bitmap, { rotateAuto: true });
    textOut += (data?.text || "") + "\n";

    // Per-page memory hygiene
    try { bitmap.close(); } catch {}
    try { page.cleanup(); } catch {}
    try { canvas.width = 1; canvas.height = 1; } catch {}
  }

  try { await worker.terminate(); } catch {}
  try { await pdf.destroy(); } catch {}

  return { text: normalize(textOut), pages: totalPages };
}

function normalize(s){ return String(s).replace(/\u00a0/g," ").replace(/[ \t]+/g," ").replace(/\s+\n/g,"\n").trim(); }

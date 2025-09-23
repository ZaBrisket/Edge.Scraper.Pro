/**
 * Parse DOCX to text using mammoth (browser build exposes window.mammoth).
 * @param {Uint8Array} data
 * @param {(progress:number)=>void} [onProgress]
 * @returns {Promise<{text:string,pages:undefined}>}
 */
export async function parseDocx(data, onProgress = () => {}) {
  if (!window?.mammoth?.extractRawText) {
    throw new Error("DOCX parsing unavailable: mammoth library did not load.");
  }
  onProgress(10);
  const { value } = await window.mammoth.extractRawText({ arrayBuffer: data.buffer });
  onProgress(100);
  return { text: normalize(value || ""), pages: undefined };
}
function normalize(s) {
  return String(s).replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s+\n/g, "\n").trim();
}

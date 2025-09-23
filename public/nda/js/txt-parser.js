/**
 * Parse a plain text file via File API.
 * @param {File} file
 * @param {(progress:number)=>void} [onProgress]
 * @returns {Promise<{text:string,pages:undefined}>}
 */
export async function parseTxt(file, onProgress = () => {}) {
  onProgress(25);
  const text = await file.text();
  onProgress(100);
  return { text: normalize(text), pages: undefined };
}
function normalize(s) {
  return String(s).replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s+\n/g, "\n").trim();
}

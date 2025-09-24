// Netlify Functions v2 - standard Request/Response API
// POST multipart/form-data → analyze NDA against Edgewater checklist
// Accept .docx/.pdf/.txt; stream with busboy, size-capped.

import Busboy from "busboy";
import { Readable } from "node:stream";
import { analyzeNDA } from "../../src/nda/analyzer";
import { loadChecklistFromJson } from "../../src/nda/checklist";
import {
  extractTextFromDocx,
  extractTextFromPdf,
  extractTextFromTxt
} from "../../src/nda/docx-utils";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB
const ALLOWED = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "text/plain"
]);
const ALLOWED_EXT = new Set([".docx", ".pdf", ".txt"]);

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST")
    return new Response("Method Not Allowed", { status: 405 });

  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return new Response(
      JSON.stringify({ error: "Expected multipart/form-data" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { file, filename, mime, checklistJson } = await parseMultipart(req);

    if (!file?.length) return json({ error: "No file received" }, 400);
    const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
    if (!ALLOWED_EXT.has(ext) && !ALLOWED.has(mime))
      return json({ error: "Unsupported file type" }, 415);

    let text = "";
    if (ext === ".docx" || mime.includes("officedocument"))
      text = await extractTextFromDocx(file);
    else if (ext === ".pdf" || mime.includes("pdf"))
      text = await extractTextFromPdf(file);
    else text = extractTextFromTxt(file);

    const checklist = loadChecklistFromJson(checklistJson);
    const analysis = analyzeNDA(text, checklist);
    return json(analysis, 200);
  } catch (e: any) {
    return json({ error: e?.message || "Failed to analyze document" }, 500);
  }
};

function json(obj: any, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function parseMultipart(
  req: Request
): Promise<{
  file: Buffer;
  filename: string;
  mime: string;
  checklistJson?: string;
}> {
  const bb = Busboy({ headers: Object.fromEntries(req.headers.entries()) });
  const body = req.body;
  if (!body) throw new Error("Empty request body");
  const stream = Readable.fromWeb(body as any);

  const fileBufs: Buffer[] = [];
  let fileSize = 0;
  let filename = "upload";
  let mime = "application/octet-stream";
  let checklistJson: string | undefined;

  const p = new Promise<{
    file: Buffer;
    filename: string;
    mime: string;
    checklistJson?: string;
  }>((resolve, reject) => {
    bb.on("file", (_name, file, info) => {
      filename = info.filename || filename;
      mime = info.mimeType || mime;
      file.on("data", (d: Buffer) => {
        fileSize += d.length;
        if (fileSize > MAX_BYTES) {
          bb.removeAllListeners();
          reject(new Error("File too large"));
          return;
        }
        fileBufs.push(d);
      });
    });
    bb.on("field", (name, val) => {
      if (name === "checklist") checklistJson = val;
    });
    bb.on("error", (err) => reject(err));
    bb.on("finish", () =>
      resolve({
        file: Buffer.concat(fileBufs),
        filename,
        mime,
        checklistJson
      })
    );
  });

  stream.pipe(bb);
  return p;
}

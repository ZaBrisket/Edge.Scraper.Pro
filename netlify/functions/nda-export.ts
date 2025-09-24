// POST JSON { originalDocBase64: string, edits: SuggestedEdit[], author?: string }
// Returns application/vnd.openxmlformats-officedocument.wordprocessingml.document

import { buildTrackedDocx } from "../../src/nda/redline";

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST")
    return new Response("Method Not Allowed", { status: 405 });
  try {
    const { originalDocBase64, edits, author } = await req.json();
    if (!originalDocBase64 || !Array.isArray(edits)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const original = Buffer.from(originalDocBase64, "base64");
    const mapped = edits.map((e: any) => ({
      originalText: e.originalText || "",
      suggestedText: e.suggestedText || "",
      reason: e.reason || "",
      author
    }));
    const out = await buildTrackedDocx(original, mapped, author);
    return new Response(out, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition":
          `attachment; filename="Edgewater-NDA-Redline.docx"`
      }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Export failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

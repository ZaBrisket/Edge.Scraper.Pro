import { describe, it, expect } from "vitest";
import ndaExport from "../../netlify/functions/nda-export";

describe("nda export endpoint", () => {
  it("rejects non-docx payloads", async () => {
    const payload = {
      originalDocBase64: Buffer.from("%PDF-1.7").toString("base64"),
      edits: []
    };
    const req = new Request("http://localhost/.netlify/functions/nda-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const res = await ndaExport(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/\.docx/);
  });
});

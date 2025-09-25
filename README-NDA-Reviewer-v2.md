# NDA Reviewer v2

NDA Reviewer v2 adds **.docx upload**, **burdensomeness‑aware redlines**, **user‑selectable suggestions**, and **tracked‑changes export to Word** — all with deterministic heuristics based on the **Edgewater NDA Checklist**.

> ⚖️ Not legal advice. This tool flags likely issues and drafts edits aligned to the checklist; counsel review is recommended.

## What’s new
- **.docx upload & parsing** (serverless; `.docx` only, default 5 MB limit; `.docm` rejected)
- **Issue panel** with clause type, score, rationale, proposed edit; search/filter; select all/none
- **Apply Selected** to preview in‑app diff (original vs. proposed)
- **Export Redlines (.docx)** with real **tracked changes** (`<w:ins>`/`<w:del>`)
- **Telemetry**: console‑only anonymized counts & error classes with correlation IDs

## How it works
- The browser runs a **deterministic policy engine** (no network) that segments text, detects clauses, computes a **burdensomeness score**, compares to the checklist, and crafts minimal edits.  
- Serverless functions:
- `nda-parse-docx` validates and extracts clean paragraphs from the uploaded `.docx`
- `nda-export-docx` maps user‑selected edits into the original `.docx` and returns a Word file with **tracked changes**

## Limits & fallbacks
- **Size**: default 5 MB (configurable via `NDA_MAX_DOCX_MB`).
- **Pages**: if trivially obtainable from `docProps/app.xml`, we show an approximate pages count.
- **Structure**: when mapping is ambiguous (e.g., complex tables/images), we restrict to **within‑paragraph** spans and **skip** edits we can’t safely map; skipped items are returned in the response and logged via telemetry.
- **Security**: `.docm` blocked; macro content types rejected; errors include an anonymized correlation ID; no PII is logged. The `/nda/` page now ships with a strict `Content-Security-Policy` (`default-src 'self'`) and no external CDN dependencies.

## Troubleshooting
- **`skipped[]` entries** surface edits that were not applied (e.g., paragraphs embedded in tables or lists). Each entry includes the edit index and reason so analysts can manually adjust the source document.
- **Paragraph-only redlines**: mappings stay inside a single `<w:p>`; cross-paragraph replacements, numbering metadata, or table grids are intentionally skipped to avoid corrupting layout. Re-run after adjusting the doc or apply those edits manually.
- **Special characters**: smart quotes and entities are normalized for matching but preserved in output. Ampersands, angle brackets, and similar characters are encoded exactly once inside `<w:delText>` / `<w:t>` so Word renders them correctly without double-encoding artifacts.

## Local dev
```bash
npm install
npm run dev          # Netlify Dev (serves public/ and functions)
npm run test         # run unit + integration tests
npm run serve        # optional static serve on :8080 (no functions)
```

## Environment

See `.env.example` for configuration. In Netlify UI, set env vars on the site.

## Privacy

No documents, texts, or edits are sent to third parties. Parsing and export run in Netlify Functions in your account. Telemetry is console‑only and anonymized.

## Acknowledgments

OOXML tracked‑changes insertion is purpose‑built for this app (JSZip + string‑safe injection around `<w:t>` runs). It targets common NDA constructs and favors safety over aggressive rewrites.

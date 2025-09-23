# NDA Reviewer — Operator Notes (v1.1)

## Modes
- **Flag-only (default):** local parsing + rules + semantic embeddings. No uploads.
- **Pro redlines:** calls `/.netlify/functions/nda-redline-ast` (Aspose). Applies paragraph-scoped range replacements and adds comments with revision author.
- **Precedents:** `/.netlify/functions/precedents` (Netlify Blobs) records accepted ops keyed by `counterparty`.

## Local semantic matching
- Uses Transformers.js (Xenova/all-MiniLM-L6-v2) in a Web Worker to compute embeddings. No data leaves the browser.
- Synonym clusters expand regex coverage.

## Quick wins
- **Defined terms** consistency list
- **Obligation asymmetry** basic counter
- **Fallbacks** surfaced in the UI to guide alternatives

## Env (Netlify)
- `ASPOSE_CLIENT_ID`, `ASPOSE_CLIENT_SECRET` required for Pro redlines.

## Notes
- Range replacements target **paragraph scope** to preserve lists/numbering and avoid cross-ref corruption.
- Store precedents only (no documents). You can purge the Blobs store from Netlify UI if desired.

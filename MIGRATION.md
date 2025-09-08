# Migration to 2.0.0 — Bulk-Only

## What changed
- **Schema Scrape** feature removed.
- `/api/get-schema` now returns **410 Gone** with `SCHEMA_REMOVED`.
- The app now supports **Bulk Scrape only**.

## How to use Bulk Scrape
- Open the UI → paste one URL per line → **Scrape**.
- Programmatic: `/.netlify/functions/fetch-url?url=<https URL>` returns page content safely.

## Deprecations
- Any previous calls to `/api/get-schema` must be removed. Use Bulk flow instead.
- Remove any unused env vars related to schema (e.g., `GEMINI_API_KEY`).

## Versioning
- This is a **major** release due to removal of an endpoint/feature.

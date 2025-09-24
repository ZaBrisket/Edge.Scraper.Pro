# Changelog

## [2.2.0] - 2025-09-24

### Added

* Tools Hub landing page with brutalist wrappers for Scrape, Sports, Companies, Targets, and NDA (iframe embeds keep legacy apps intact).
* Playwright smoke coverage for the new wrappers plus unit tests for `ma-news-scraper` error paths and discovery stats.

### Changed

* Rebuilt `ma-news-scraper` to rely on the hardened HTTP helpers (`safeParseUrl`, `followRedirectsSafely`, byte caps, concurrency bounds) while preserving the public payload schema.
* Updated the shared navigation highlighter so every route reflects the active page across trailing-slash variants.

### Security

* Tightened the NDA Reviewer CSP to drop `unsafe-inline` scripts while allowing required styles and same-origin fetches.

## [2.1.0] - 2025-09-23

### Added

* **NDA Reviewer v2**:

  * `.docx` upload & parsing with validation and macro blocking
  * Deterministic, burdensomeness‑aware redlines based on the Edgewater checklist
  * Issue panel with selection and preview diff
  * Export to `.docx` with **tracked changes** (`<w:ins>`/`<w:del>`)
  * Unit tests including OOXML assertions
  * Anonymized telemetry with correlation IDs

### Security

* Enforced `.docx` size limit (default 5 MB) via `NDA_MAX_DOCX_MB`
* Reject macro-enabled files and macro content types

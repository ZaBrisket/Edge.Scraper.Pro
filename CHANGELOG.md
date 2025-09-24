# Changelog

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

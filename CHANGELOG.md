# Changelog

## [3.0.2] - 2025-09-25

### Added
- Frame guard UMD module with telemetry reporting and automated allowlist bootstrapping
- Deterministic NDA bootstrapper that swaps to the fallback engine only when the primary script fails to load
- Generic iframe loader shared by NDA and Targets wrappers with retry telemetry hooks
- Unit and integration coverage for frame ancestry enforcement plus updated Playwright selectors
- Husky pre-commit hook, GitHub Actions CI workflow, and build-time nonce tooling

### Changed
- Externalised all iframe loader scripts to remove `script-src 'unsafe-inline'` requirements from the CSP
- Consolidated brutalist `.app-frame` styling and refreshed documentation for CSP/allowlist governance
- Updated README with CSP guidance and nonce workflow for future inline scripts

### Fixed
- Frame ancestry enforcement now blocks empty or spoofed referrers with a user-facing message instead of failing open
- Playwright E2E tests reference the current export button identifiers for the Targets experience

## [3.0.1] - 2025-09-24

### Fixed
- Resolved iframe loading failures for M&A Target Scraper and NDA Reviewer
- Fixed Content Security Policy blocking scripts in NDA Reviewer iframe context
- Corrected relative path resolution issues in embedded applications
- Added retry mechanism for iframe loading with exponential backoff
- Implemented policy engine fallback for build failures

### Added  
- Telemetry logging for iframe load events and failures
- Integration tests for iframe retry mechanism
- E2E tests for NDA Reviewer and M&A Target Scraper
- Enhanced security headers (X-Frame-Options, X-Content-Type-Options)
- Basic clause detection in policy engine fallback

### Changed
- Updated all resource paths from relative to absolute in embedded apps
- Enhanced .app-frame CSS with min-height constraint
- Improved iframe error states with retry attempts

### Removed
- Deleted legacy targets.html (837 lines) - dark theme version
- Deleted legacy targets.js (2,294 lines) - old implementation

### Security
- Adjusted CSP to allow iframe embedding while maintaining XSS protection
- Added SAMEORIGIN X-Frame-Options to prevent clickjacking

## [3.0.0] - Previous releases...

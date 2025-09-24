# Changelog

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

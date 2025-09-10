### Task: Add bulk URL upload (TXT/JSON) for scraping

**Goal**: Enable users to upload a TXT or JSON file containing URLs to scrape. The system should parse/normalize/validate up to 1500 URLs and enqueue them for scraping.

#### Requirements
- **Supported file types**: `.txt`, `.json`
- **TXT parsing**:
  - Treat each non-empty line as a candidate URL
  - Trim whitespace
  - Ignore lines starting with `#`
- **JSON parsing**:
  - Accept either:
    - Array of URL strings: `[
      "https://a.com",
      "https://b.com"
    ]`
    - Array of objects with a `url` field: `[
      {"url":"https://a.com"},
      {"url":"https://b.com"}
    ]`
  - Ignore extra fields; only the `url` field is required in object entries
- **Validation & normalization**:
  - Require absolute `http`/`https` URLs
  - Normalize (lowercase scheme/host, strip fragments, remove default ports, trim whitespace, remove trailing slash unless root)
  - Deduplicate after normalization
  - Enforce a hard cap of 1500 URLs per upload (after dedup). If more are provided, accept the file, process the first 1500, and report the count truncated.
- **Scraping integration**:
  - Enqueue validated URLs into the existing scraping pipeline in batch
  - Concurrency and rate-limits should follow current scraper settings
- **UX/API**:
  - If UI exists: add an upload control (drag-and-drop + file picker)
  - If API exists: add `POST /uploads/urls` (multipart/form-data) with `file` field; return a batch/job id and counts
- **Feedback**:
  - Return counts: total parsed, valid, deduplicated, enqueued, truncated count (if any), and invalid rows with reasons (sample up to 50)
  - Provide a downloadable CSV/JSON of invalid entries (optional but preferred)
- **Limits & safety**:
  - Max file size: 5 MB
  - Content type check: only `text/plain` or `application/json`
  - Reject binary files; validate extension and MIME
  - Timeouts and memory-safe streaming read for large lines
- **Observability**:
  - Log batch id, counts, and first N invalid samples
  - Emit metrics: `uploads_total`, `urls_enqueued_total`, `urls_invalid_total`, `urls_truncated_total`

#### Acceptance Criteria
- Uploading a `.txt` file with 1500 valid URLs results in 1500 enqueued URLs, with correct counts reported.
- Uploading a `.json` array of strings with mixed duplicates and whitespace is normalized and deduplicated correctly; report accurate counts and invalid samples.
- Uploading a `.json` array of objects with a `url` field is supported; extra fields are ignored.
- Lines starting with `#` in `.txt` files are ignored.
- Invalid entries (e.g., missing scheme, unsupported scheme, malformed URL, relative paths) are excluded and reported with reasons.
- If more than 1500 valid deduplicated URLs are present, only the first 1500 are enqueued; response indicates truncation.
- API endpoint `POST /uploads/urls` accepts multipart file upload, returns `201` with JSON containing batch id and counts.
- UI (if present) allows selecting a file, shows a summary with counts, and links to the batch/job view.
- Unit tests cover parsers (TXT/JSON), normalization, dedup, cap logic, and validation edge cases.
- E2E test demonstrates full flow: upload → batch created → URLs enqueued → progress visible.

#### Non-Goals / Out of Scope
- Building new scraping logic; only ingest/enqueue changes.
- CSV, NDJSON, or nested JSON shapes (can be added later).
- Per-domain throttling changes.

#### Implementation Notes
- Normalize URLs: lowercase scheme/host; remove fragment; remove default ports; normalize trailing slash (keep root `/` only); trim.
- Deduplicate using a set on normalized URLs before capping to 1500.
- Validation should reject: empty strings, relative URLs, unsupported schemes, malformed hosts.
- Keep the ingest path streaming to avoid loading entire file into memory.
- Respect existing robots/allowlist/denylist behavior in the scraping layer; uploader does not pre-check reachability.

#### API Contract
- Request: `POST /uploads/urls` (multipart/form-data)
  - Field: `file` (required) `.txt` or `.json`
- Response: `201 application/json`
  - `{
    "batchId": "string",
    "counts": {
      "parsed": n,
      "valid": n,
      "deduplicated": n,
      "enqueued": n,
      "invalid": n,
      "truncated": n
    },
    "invalidSamples": [
      { "line": idxOrIndex, "value": "string", "reason": "string" }
    ]
  }`
- Errors:
  - `400`: invalid file type/JSON schema/empty file
  - `413`: file too large
  - `415`: unsupported media type

#### Example Files
- TXT:
```
# Marketing pages
https://example.com
https://example.com/pricing

https://example.com/blog
```
- JSON (strings):
```json
[
  "https://example.com",
  "https://example.com/pricing"
]
```
- JSON (objects):
```json
[
  { "url": "https://example.com" },
  { "url": "https://example.com/pricing", "tag": "pricing" }
]
```

#### Testing
- Unit: parser for TXT/JSON; URL normalization; validation; deduplication; cap logic.
- Integration: endpoint/controller handling and job enqueueing.
- E2E: upload a file with >1500 valid URLs and verify only 1500 enqueued; UI/API reflects truncation.

#### Definition of Done
- Users can upload `.txt` or `.json` with up to 1500 URLs and start a scrape.
- Accurate counts and errors are returned and visible.
- Docs updated to show accepted formats and limits.
- Tests for parsers and upload flow are passing.
- Metrics and logs emitted for observability.


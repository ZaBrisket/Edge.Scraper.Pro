# AI Web Scraper — Migration & Deployment Guide

This guide outlines how to deploy the refactored **AI Web Scraper** to Netlify and summarizes the key architectural changes that were implemented based on expert code reviews.

---

## How to Deploy to Netlify

> **Prerequisites:** a free Netlify account and the project folder from this archive.

### Project Structure

```
/
|-- netlify.toml
|-- MIGRATION.md
|-- /public/
|   |-- index.html
|-- /netlify/
|   |-- /functions/
|   |   |-- fetch-url.js
|   |   |-- get-schema.js
```

### Step-by-Step Deployment

1. **Prepare your files**
   - Extract this ZIP to a local folder (e.g., `ai-scraper-project`).
   - Ensure the structure matches the tree shown above.

2. **Sign up / Log in to Netlify**
   - Visit **netlify.com** and create a free account or log in.

3. **Deploy your site**
   - From the Netlify dashboard, click **“Add new site” → “Deploy manually”**.
   - Drag and drop your **entire project folder** (`ai-scraper-project`) into the drop zone.
   - Netlify will assign your site a random name (e.g., `random-name-12345.netlify.app`).

4. **Set environment variable (CRITICAL)**
   - Go to **Site configuration → Build & deploy → Environment → Environment variables**.
   - Click **“Edit variables”**, then add:
     - **Key:** `GEMINI_API_KEY`
     - **Value:** your actual Gemini API key
   - Click **Save**.

5. **Trigger a re-deploy**
   - Open the **Deploys** tab.
   - On the most recent deployment, open **“Trigger deploy” → “Deploy site”**.
   - After the redeploy finishes, your functions will have access to `GEMINI_API_KEY`.

Your site is now live and fully functional.

---

## Summary of Key Changes

### Backend Architecture (Security & Reliability)
- **No Exposed API Keys:** The Gemini API key is stored server-side as an environment variable. All calls to Gemini are proxied through the `get-schema.js` Netlify Function.
- **Server-Side Fetching:** All website requests are handled by the `fetch-url.js` Netlify Function. It sets a standard User‑Agent, includes basic SSRF protections, optionally checks `robots.txt`, and avoids public CORS proxies.

### Performance & Efficiency
- **Site Profiles (Selector Caching):** AI-generated selectors are cached per‑domain in `localStorage`, reducing repeated teaching.
- **Parallel Processing:** Both **Schema Scrape** and **Bulk Scrape** run URLs concurrently with a configurable delay.

### UX & Robustness
- **Pre-flight Diagnostics & Auto-Reteach:** The tool validates selectors before a long crawl, and auto‑re-teaches on selector drift.
- **Live Results Streaming:** Results render as they arrive.
- **Run Controls:** Concurrency, Delay, Pause, Resume, and Stop.
- **Smarter Extraction:** Heuristics to find “Next” links and main content; richer metadata (title, author, published time).
- **Improved Exports:** Reliable `jsonl` and `csv` based on a structured internal result model.

---

## Notes & Recommendations

- **Respect robots.txt:** The provided `fetch-url.js` performs a lightweight `robots.txt` check for `User-agent: *`. For strict compliance or custom agents, consider a full parser.
- **Timeouts & Size Limits:** The fetch function has modest timeouts and response size limits to keep the service responsive.
- **Ports & Redirects:** Non‑standard ports are blocked by default for SSRF mitigation. Redirects are followed with safety checks.
- **Gemini Model:** The default model is `gemini-1.5-flash`. You may switch to `gemini-1.5-pro` by editing the function.

## Troubleshooting & Common Issues

### Deployment failures
- **Missing `netlify.toml`:** Ensure the file exists at the project root before deploying. If absent, recreate a minimal version:
  ```toml
  [functions]
  node_bundler = "esbuild"
  ```
- **Incorrect folder structure:** Netlify expects functions under `netlify/functions/`. Confirm the directory tree matches the earlier example, then redeploy.

### API key validation
- In the Netlify dashboard, navigate to **Site configuration → Environment variables** and confirm `GEMINI_API_KEY` is defined.
- From the CLI, run `netlify env:list` to verify the variable is available.
- Inside a function, log `process.env.GEMINI_API_KEY` to confirm access and redeploy if the value was added or changed.

### 404 errors on functions
- Ensure function file names match endpoint URLs, e.g. `fetch-url.js` is served at `/.netlify/functions/fetch-url`.
- Verify functions reside in `netlify/functions/` and trigger a new deploy after changes.
- Use the Netlify **Deploy logs** or `netlify functions:log` to inspect any failures.

### CORS issues
- Add headers in your functions:
  ```js
  headers: { 'Access-Control-Allow-Origin': '*' }
  ```
- In browser dev tools, confirm requests include the expected CORS headers and no errors appear in the console.

### Gemini API quota/rate-limit errors
- A `429` status or `rateLimitExceeded` message indicates quota limits.
- Implement retries with exponential backoff and monitor usage in the Gemini dashboard.

### Browser compatibility notes
- Tested with the latest versions of **Chrome**, **Edge**, and **Firefox**.
- Safari may require polyfills for `ReadableStream` support.

### Quick Health Check
Use these commands (replace `your-site` with your actual domain):
```bash
curl -i https://your-site.netlify.app/.netlify/functions/fetch-url?url=https://example.com
curl -i https://your-site.netlify.app/.netlify/functions/get-schema
```
Both should return a `200` response.

## Rollback Instructions
- **Netlify UI:** In the **Deploys** tab, select a previous successful deploy and click **“Publish deploy”** to revert.
- **Netlify CLI:**
  ```bash
  netlify deploy --prod --deploy-id <previous_deploy_id>
  ```
  Obtain the ID via `netlify deploy:list`.

## Version Compatibility Matrix

| Project Version | Node.js Version | Netlify Runtime | Breaking Changes |
|-----------------|----------------|-----------------|------------------|
| 1.0.0           | >=18.x         | Node 18         | Initial release |
| 1.1.0           | >=18.x         | Node 18         | Adjusted fetch function; no API changes |
| 2.0.0           | >=20.x         | Node 20         | Functions migrated to ES modules; adjust imports |


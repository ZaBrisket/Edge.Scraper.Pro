#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const HTML_EXT = '.html';
const SCRIPT_TAG_WITH_DATA_NONCE = /<script\b[^>]*\bdata-nonce\b[^>]*>/gi;
const DATA_NONCE_ATTRIBUTE = /\sdata-nonce(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/i;
const CSP_META_REGEX = /<meta[^>]+http-equiv\s*=\s*("|')Content-Security-Policy\1[^>]*>/i;
const CSP_CONTENT_REGEX = /content\s*=\s*("([^"]*)"|'([^']*)')/i;

let updatedFiles = 0;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === HTML_EXT) {
      processHtml(fullPath);
    }
  }
}

function processHtml(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  if (!SCRIPT_TAG_WITH_DATA_NONCE.test(original)) {
    return;
  }

  SCRIPT_TAG_WITH_DATA_NONCE.lastIndex = 0;

  const nonce = crypto.randomBytes(16).toString('base64');
  let replaced = original.replace(SCRIPT_TAG_WITH_DATA_NONCE, (tag) => {
    const cleaned = tag.replace(DATA_NONCE_ATTRIBUTE, '');
    if (/\bnonce\s*=/.test(cleaned)) {
      return cleaned;
    }
    return cleaned.replace('<script', '<script nonce="' + nonce + '"');
  });

  const metaMatch = replaced.match(CSP_META_REGEX);
  if (!metaMatch) {
    throw new Error(`Missing CSP meta tag in ${path.relative(ROOT, filePath)}`);
  }

  const metaTag = metaMatch[0];
  const contentMatch = metaTag.match(CSP_CONTENT_REGEX);
  if (!contentMatch) {
    throw new Error(`Missing CSP content attribute in ${path.relative(ROOT, filePath)}`);
  }
  const cspValue = contentMatch[2] || contentMatch[3] || '';
  const updatedCsp = addNonceToScriptSrc(cspValue, nonce);
  if (updatedCsp === cspValue) {
    // ensure nonce still replaced if script tag added
    replaced = replaced.replace(metaTag, metaTag);
  } else {
    const newMetaTag = metaTag.replace(CSP_CONTENT_REGEX, `content="${updatedCsp}"`);
    replaced = replaced.replace(metaTag, newMetaTag);
  }

  if (replaced !== original) {
    fs.writeFileSync(filePath, replaced, 'utf8');
    updatedFiles += 1;
    console.log(`[build-nonces] Injected nonce into ${path.relative(ROOT, filePath)}`);
  }
}

function addNonceToScriptSrc(csp, nonce) {
  const directives = csp.split(';');
  let updated = false;
  const processed = directives.map((directive) => {
    const trimmed = directive.trim();
    if (!trimmed) {
      return '';
    }
    if (trimmed.startsWith('script-src')) {
      if (trimmed.indexOf(`'nonce-${nonce}'`) === -1) {
        updated = true;
        return `${trimmed} 'nonce-${nonce}'`;
      }
    }
    return trimmed;
  }).filter(Boolean);

  if (processed.length === 0) {
    return csp;
  }

  if (!processed.some((directive) => directive.startsWith('script-src'))) {
    throw new Error('script-src directive missing; cannot apply nonce.');
  }

  if (!updated) {
    return csp;
  }

  return processed.join('; ');
}

function main() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    console.error('[build-nonces] Public directory not found.');
    process.exit(1);
  }
  walk(PUBLIC_DIR);
  console.log(`[build-nonces] Completed. Updated ${updatedFiles} file(s).`);
}

try {
  main();
} catch (err) {
  console.error('[build-nonces] Failed:', err.message);
  process.exit(1);
}

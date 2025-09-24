#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');

const componentFiles = [
  path.join(publicDir, 'components', 'navigation.js'),
  path.join(publicDir, 'components', 'error-handler.js'),
  path.join(publicDir, 'components', 'file-uploader.js'),
  path.join(publicDir, 'components', 'loader.js')
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function bundleComponents() {
  const outPath = path.join(distDir, 'components.bundle.js');
  const parts = componentFiles.map(file => fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(outPath, parts.join('\n\n'), 'utf8');
  return outPath;
}

function copyCss() {
  const cssSource = path.join(publicDir, 'assets', 'css', 'brutalist.css');
  const cssTarget = path.join(distDir, 'brutalist.css');
  const css = fs.readFileSync(cssSource, 'utf8');
  const minified = css.replace(/\s+/g, ' ').replace(/\s*{\s*/g, '{').replace(/;\s*/g, ';').replace(/}\s*/g, '}');
  fs.writeFileSync(cssTarget, minified, 'utf8');
  return cssTarget;
}

function main() {
  ensureDir(distDir);
  const bundlePath = bundleComponents();
  const cssPath = copyCss();
  console.log(`Bundled components to ${bundlePath}`);
  console.log(`Minified brutalist CSS to ${cssPath}`);
}

if (require.main === module) {
  main();
}

module.exports = { bundleComponents, copyCss };

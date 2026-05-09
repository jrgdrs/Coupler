#!/usr/bin/env node
// build.js — assembles src/ modules into deployment ui.html
// Usage:
//   node build.js                  — plain build
//   node build.js --obfuscate      — obfuscate JS (different output each run)
//   node build.js 5.5.0            — update version string

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT     = __dirname;
const SRC_JS   = path.join(ROOT, 'src/js');
const SRC_CSS  = path.join(ROOT, 'src/css/style.css');
const TEMPLATE = path.join(ROOT, 'src/html/template.html');
const OUT      = path.join(ROOT, 'glyphs/Coupler.glyphsPlugin/Contents/Resources/ui.html');

const args       = process.argv.slice(2);
const obfuscate  = args.includes('--obfuscate');
const newVersion = args.find(a => /^\d+\.\d+/.test(a)) || null;

// 1. Read template
let html = fs.readFileSync(TEMPLATE, 'utf8');

// 2. Inject CSS
const css = fs.readFileSync(SRC_CSS, 'utf8');
// Use function replacements to prevent $` $' $& etc. being interpreted as
// special replacement patterns (relevant when CSS/JS contains $ characters).
html = html.replace('%%STYLE%%', () => css);

// 3. Concatenate JS modules in numeric order, stripping Node.js export tail
const jsFiles = fs.readdirSync(SRC_JS)
  .filter(f => /^\d{2}-.*\.js$/.test(f))
  .sort();

let js = '';
for (const f of jsFiles) {
  let src = fs.readFileSync(path.join(SRC_JS, f), 'utf8');
  // Strip trailing module.exports block (everything from the last blank line before it)
  src = src.replace(/\n+if\s*\(\s*typeof\s+module\s*!==\s*['"]undefined['"]\s*\)[^}]*\}[;\s]*$/s, '');
  js += src.trimEnd() + '\n\n';
}

// 4. Optionally obfuscate — no seed so every build differs
if (obfuscate) {
  try {
    const { obfuscate: obf } = require('javascript-obfuscator');
    const result = obf(js, {
      compact: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      stringArray: true,
      stringArrayThreshold: 0.4,
      stringArrayEncoding: ['base64'],
      renameGlobals: false,
      selfDefending: false,
    });
    js = result.getObfuscatedCode();
    console.log('Obfuscation applied.');
  } catch (e) {
    console.warn('javascript-obfuscator not available — skipping:', e.message);
  }
}

html = html.replace('%%SCRIPTS%%', () => js);

// 5. Version substitution
if (newVersion) {
  const tag = 'v' + newVersion;
  // Replace all version occurrences in template (title + header span)
  html = html.replace(/v\d+\.\d+\.\d+[^\s<"]*/g, tag);
  // Also update the template source for future builds
  let tpl = fs.readFileSync(TEMPLATE, 'utf8');
  tpl = tpl.replace(/v\d+\.\d+\.\d+[^\s<"]*/g, tag);
  fs.writeFileSync(TEMPLATE, tpl, 'utf8');
  console.log('Version updated to', tag);
}

// 6. Write output
fs.writeFileSync(OUT, html, 'utf8');
const kb = Math.round(Buffer.byteLength(html, 'utf8') / 1024);
console.log(`Built ${OUT} (${kb} KB)`);

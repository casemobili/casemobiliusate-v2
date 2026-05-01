#!/usr/bin/env node
// AUDIT SEO ULTIMATIVO — controlla OGNI aspetto critico per ranking Google.
// Trova ogni problema e produce un report categorizzato con priorità.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

function findHtmlFiles(dir, results = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findHtmlFiles(full, results);
    else if (e.isFile() && e.name === 'index.html') results.push(full);
  }
  return results;
}

const files = findHtmlFiles(distDir);
const issues = {
  critical: [], // blocca SEO
  important: [], // riduce SEO
  optimization: [], // miglioramenti
};

// Cache di tutti i path validi nel dist (per check link rotti)
const validPaths = new Set();
for (const f of files) {
  const rel = '/' + path.relative(distDir, f).replace(/\/index\.html$/, '');
  validPaths.add(rel === '/.' ? '/' : rel);
}
// Aggiungi anche file statici (favicon, og-default, etc.)
function findStatics(dir, base = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const relUrl = base + '/' + e.name;
    if (e.isFile() && !e.name.endsWith('.html')) validPaths.add(relUrl);
    else if (e.isDirectory() && !e.name.endsWith('-')) findStatics(full, relUrl);
  }
}
findStatics(distDir);

function getUrl(file) {
  const rel = '/' + path.relative(distDir, file).replace(/\/index\.html$/, '');
  return rel === '/.' ? '/' : rel;
}

function extractAll(html, regex, group = 1) {
  return [...html.matchAll(regex)].map(m => m[group]);
}

let totalIssues = 0;

console.log('🔍 AUDIT SEO ULTIMATIVO — controllo proattivo su 79 pagine...\n');

const pageStats = { critical: 0, important: 0, optimization: 0 };

for (const file of files) {
  const html = fs.readFileSync(file, 'utf-8');
  const url = getUrl(file);

  // Skip /admin (intentionally noindex)
  if (url === '/admin') continue;

  // ─── 1. TITLE ────────────────────────────────────────────────────
  const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1];
  if (!title) {
    issues.critical.push({ url, kind: 'missing-title', detail: 'Tag <title> assente' });
  } else {
    const titleLen = title.length;
    if (titleLen > 70) {
      issues.important.push({ url, kind: 'title-too-long', detail: `${titleLen} caratteri (>70)` });
    }
    if (titleLen < 30) {
      issues.important.push({ url, kind: 'title-too-short', detail: `${titleLen} caratteri (<30)` });
    }
  }

  // ─── 2. META DESCRIPTION ─────────────────────────────────────────
  const meta = (html.match(/name="description"\s+content="([^"]+)"/) || [])[1];
  if (!meta) {
    issues.critical.push({ url, kind: 'missing-meta-description', detail: 'Meta description assente' });
  } else {
    if (meta.length > 165) {
      issues.important.push({ url, kind: 'meta-too-long', detail: `${meta.length} caratteri (>165)` });
    }
    if (meta.length < 80) {
      issues.important.push({ url, kind: 'meta-too-short', detail: `${meta.length} caratteri (<80)` });
    }
  }

  // ─── 3. CANONICAL ────────────────────────────────────────────────
  const canonical = (html.match(/rel="canonical"\s+href="([^"]+)"/) || [])[1];
  if (!canonical) {
    issues.critical.push({ url, kind: 'missing-canonical', detail: 'Tag canonical assente' });
  } else if (!canonical.startsWith('https://www.casemobiliusate.com')) {
    issues.critical.push({ url, kind: 'wrong-canonical-domain', detail: canonical });
  }

  // ─── 4. H1 ──────────────────────────────────────────────────────
  const h1Matches = [...html.matchAll(/<h1[^>]*>[\s\S]*?<\/h1>/g)];
  if (h1Matches.length === 0) {
    issues.critical.push({ url, kind: 'missing-h1', detail: 'Tag <h1> assente' });
  } else if (h1Matches.length > 1) {
    issues.important.push({ url, kind: 'multiple-h1', detail: `${h1Matches.length} H1 trovati` });
  }

  // ─── 5. HEADING HIERARCHY (no H3 senza H2 prima, ecc.) ───────────
  const headingsOrder = [...html.matchAll(/<h([1-6])[^>]*>/g)].map(m => parseInt(m[1]));
  let lastLevel = 0;
  for (const lvl of headingsOrder) {
    if (lastLevel > 0 && lvl - lastLevel > 1) {
      issues.optimization.push({ url, kind: 'heading-skip', detail: `H${lastLevel} → H${lvl} (salto)` });
      break; // un solo report per pagina
    }
    lastLevel = lvl;
  }

  // ─── 6. IMG ALT ──────────────────────────────────────────────────
  const imgs = [...html.matchAll(/<img\s+[^>]*>/g)];
  for (const m of imgs) {
    const tag = m[0];
    const altMatch = tag.match(/\salt="([^"]*)"/);
    if (!altMatch) {
      issues.important.push({ url, kind: 'img-no-alt', detail: tag.slice(0, 80) + '...' });
    } else if (altMatch[1].trim() === '') {
      // alt="" è valido per immagini decorative; segnalo come optimization
      issues.optimization.push({ url, kind: 'img-empty-alt', detail: tag.slice(0, 80) + '...' });
    }
  }

  // ─── 7. LAZY LOADING (per img non above-fold) ────────────────────
  for (const m of imgs) {
    const tag = m[0];
    if (!tag.match(/loading=/)) {
      // Solo segnalo come optimization (non blocking)
      issues.optimization.push({ url, kind: 'img-no-loading-attr', detail: tag.slice(0, 80) + '...' });
    }
  }

  // ─── 8. INTERNAL LINKS ─ broken? ─────────────────────────────────
  const internalHrefs = extractAll(html, /href="(\/[^"#]*)"/g);
  for (const href of internalHrefs) {
    if (href.startsWith('/cdn-cgi') || href.startsWith('/_astro')) continue;
    if (href === '/' || validPaths.has(href.replace(/\/$/, ''))) continue;
    if (validPaths.has(href)) continue;
    issues.critical.push({ url, kind: 'broken-internal-link', detail: href });
  }

  // ─── 9. EXTERNAL LINKS ─ rel noopener? ────────────────────────────
  const extLinks = [...html.matchAll(/<a\s+[^>]*href="https?:\/\/(?!www\.casemobiliusate\.com)[^"]+"[^>]*>/g)];
  for (const m of extLinks) {
    const tag = m[0];
    if (tag.includes('target="_blank"') && !tag.includes('rel=')) {
      issues.important.push({ url, kind: 'external-no-rel', detail: tag.slice(0, 100) + '...' });
    }
  }

  // ─── 10. NOINDEX accidentale? ─────────────────────────────────────
  if (html.includes('noindex') && !url.startsWith('/admin')) {
    const robotsMatch = html.match(/name="robots"\s+content="([^"]+)"/);
    if (robotsMatch && robotsMatch[1].includes('noindex')) {
      issues.critical.push({ url, kind: 'unintended-noindex', detail: robotsMatch[1] });
    }
  }

  // ─── 11. OG IMAGE ────────────────────────────────────────────────
  const ogImage = (html.match(/property="og:image"\s+content="([^"]+)"/) || [])[1];
  if (!ogImage) {
    issues.important.push({ url, kind: 'missing-og-image', detail: 'og:image assente' });
  }

  // ─── 12. VIEWPORT ────────────────────────────────────────────────
  if (!html.match(/name="viewport"\s+content="[^"]*width=device-width/)) {
    issues.critical.push({ url, kind: 'missing-viewport', detail: 'mobile-friendly viewport assente' });
  }

  // ─── 13. LANG attribute ──────────────────────────────────────────
  if (!html.match(/<html\s+lang="it"/)) {
    issues.important.push({ url, kind: 'missing-lang', detail: 'attributo lang="it" assente' });
  }
}

// ─── REPORT ─────────────────────────────────────────────────────────
function summarize(category, issues) {
  const grouped = {};
  for (const i of issues) {
    if (!grouped[i.kind]) grouped[i.kind] = [];
    grouped[i.kind].push(i);
  }
  return grouped;
}

console.log('🚨 CRITICAL ISSUES (bloccano SEO):');
const crit = summarize('critical', issues.critical);
if (Object.keys(crit).length === 0) console.log('   ✓ NESSUNO');
else for (const [k, items] of Object.entries(crit)) {
  console.log(`   • ${k}: ${items.length} occorrenze`);
  for (const i of items.slice(0, 5)) console.log(`     - ${i.url}: ${i.detail}`);
  if (items.length > 5) console.log(`     ... e altri ${items.length - 5}`);
}

console.log('\n⚠️  IMPORTANT ISSUES (riducono SEO):');
const imp = summarize('important', issues.important);
if (Object.keys(imp).length === 0) console.log('   ✓ NESSUNO');
else for (const [k, items] of Object.entries(imp)) {
  console.log(`   • ${k}: ${items.length} occorrenze`);
  for (const i of items.slice(0, 5)) console.log(`     - ${i.url}: ${i.detail.slice(0, 100)}`);
  if (items.length > 5) console.log(`     ... e altri ${items.length - 5}`);
}

console.log('\n💡 OPTIMIZATION (miglioramenti):');
const opt = summarize('optimization', issues.optimization);
if (Object.keys(opt).length === 0) console.log('   ✓ NESSUNO');
else for (const [k, items] of Object.entries(opt)) {
  console.log(`   • ${k}: ${items.length} occorrenze`);
  if (items.length <= 3) for (const i of items) console.log(`     - ${i.url}: ${i.detail.slice(0, 100)}`);
}

console.log(`\n📊 TOTALE: ${issues.critical.length} critical, ${issues.important.length} important, ${issues.optimization.length} optimization`);

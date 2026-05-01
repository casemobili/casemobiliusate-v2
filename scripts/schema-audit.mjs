#!/usr/bin/env node
// Audit schema markup per ogni pagina del build.
// Identifica pagine SENZA schema o con schema insufficiente.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

function findHtmlFiles(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findHtmlFiles(full, results);
    else if (e.isFile() && e.name === 'index.html') results.push(full);
  }
  return results;
}

function extractSchemas(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const types = new Set();
  for (const m of blocks) {
    try {
      const data = JSON.parse(m[1]);
      if (data['@graph']) {
        for (const g of data['@graph']) types.add(g['@type']);
      } else if (Array.isArray(data)) {
        for (const d of data) if (d['@type']) types.add(d['@type']);
      } else if (data['@type']) {
        types.add(data['@type']);
      }
    } catch (e) {}
  }
  return [...types].sort();
}

function categorizePagePath(url) {
  if (url === '/' || url === '') return 'home';
  if (url === '/404') return '404';
  if (/^\/(normativa|prezzi|marche|trasporto|vivere|dove-mettere|tipologie|guide-acquisto|articoli)$/.test(url)) return 'pillar-hub';
  if (/^\/(normativa|prezzi|marche|trasporto|vivere|dove-mettere|tipologie|guide-acquisto|articoli)\//.test(url)) return 'article';
  if (/^\/(chi-siamo|contatti|privacy|affiliate-disclaimer)$/.test(url)) return 'page';
  if (url === '/community' || url === '/strumenti' || url === '/mappa-campeggi' || url === '/admin') return 'special';
  return 'unknown';
}

// WebPage e sue sottoclassi schema.org (CollectionPage, AboutPage, ContactPage, etc.)
const WEBPAGE_TYPES = ['WebPage', 'CollectionPage', 'AboutPage', 'ContactPage', 'ItemPage', 'ProfilePage', 'SearchResultsPage'];

const REQUIRED_SCHEMAS = {
  home: ['Organization', 'WebSite'],
  'pillar-hub': ['BreadcrumbList', WEBPAGE_TYPES],
  article: ['Article', 'BreadcrumbList'],
  page: ['BreadcrumbList', WEBPAGE_TYPES],
  special: [],
  '404': [],
  unknown: [],
};

const files = findHtmlFiles(distDir);
const issues = [];
const stats = { total: 0, ok: 0, missing: 0, byCategory: {} };

for (const file of files) {
  const html = fs.readFileSync(file, 'utf-8');
  const relPath = '/' + path.relative(distDir, file).replace(/\/index\.html$/, '');
  const url = relPath === '/.' ? '/' : relPath;
  const category = categorizePagePath(url);
  const types = extractSchemas(html);
  const required = REQUIRED_SCHEMAS[category] || [];
  // Each requirement can be a string (exact type) or an array (any-of)
  const missing = required.filter(r => {
    if (Array.isArray(r)) return !r.some(t => types.includes(t));
    return !types.includes(r);
  }).map(r => Array.isArray(r) ? r[0] + ' (or subclass)' : r);

  stats.total++;
  stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

  if (types.length === 0 && category !== '404') {
    issues.push({ url, category, types: [], missing: required });
    stats.missing++;
  } else if (missing.length > 0) {
    issues.push({ url, category, types, missing });
    stats.missing++;
  } else {
    stats.ok++;
  }
}

console.log('=== SCHEMA AUDIT ===\n');
console.log(`Total pagine: ${stats.total}`);
console.log(`OK (schema completo): ${stats.ok}`);
console.log(`PROBLEMI: ${stats.missing}`);
console.log(`\nPer categoria:`);
for (const [c, n] of Object.entries(stats.byCategory)) {
  console.log(`  ${c}: ${n}`);
}

if (issues.length > 0) {
  console.log('\n=== PAGINE CON SCHEMA INSUFFICIENTE ===');
  for (const i of issues) {
    console.log(`\n  ${i.url} [${i.category}]`);
    console.log(`    Schemas presenti: ${i.types.join(', ') || '(nessuno)'}`);
    console.log(`    Mancanti: ${i.missing.join(', ')}`);
  }
}

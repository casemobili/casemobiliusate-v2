#!/usr/bin/env node
// Cattura snapshot SEO di ogni pagina del build per confronto pre/post migrazione.
// Salva: title, meta description, H1, canonical, og:type per ogni HTML in dist/.

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
    if (e.isDirectory()) {
      findHtmlFiles(full, results);
    } else if (e.isFile() && e.name === 'index.html') {
      results.push(full);
    }
  }
  return results;
}

function extractField(html, regex) {
  const m = html.match(regex);
  return m ? m[1].trim() : null;
}

const files = findHtmlFiles(distDir);
const snapshot = {};

for (const file of files) {
  const html = fs.readFileSync(file, 'utf-8');
  const relPath = '/' + path.relative(distDir, file).replace(/\/index\.html$/, '');
  const url = relPath === '/' || relPath === '/.' ? '/' : relPath;

  snapshot[url] = {
    title: extractField(html, /<title>([^<]+)<\/title>/),
    metaDescription: extractField(html, /name="description"\s+content="([^"]+)"/),
    canonical: extractField(html, /rel="canonical"\s+href="([^"]+)"/),
    h1: extractField(html, /<h1[^>]*>([\s\S]*?)<\/h1>/),
    ogType: extractField(html, /property="og:type"\s+content="([^"]+)"/),
    ogTitle: extractField(html, /property="og:title"\s+content="([^"]+)"/),
    ogDescription: extractField(html, /property="og:description"\s+content="([^"]+)"/),
    schemaTypes: [...html.matchAll(/"@type":"([^"]+)"/g)].map(m => m[1]).sort().filter((v, i, a) => a.indexOf(v) === i),
    h2Count: (html.match(/<h2[^>]*>/g) || []).length,
    htmlLength: html.length,
  };
  if (snapshot[url].h1) {
    // Strip HTML from H1
    snapshot[url].h1 = snapshot[url].h1.replace(/<[^>]+>/g, '').trim();
  }
}

console.log(`Snapshot di ${Object.keys(snapshot).length} URL`);
const outFile = process.argv[2] || '/tmp/seo-baseline.json';
fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
console.log(`Salvato in ${outFile}`);

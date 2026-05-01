#!/usr/bin/env node
// Accorcia automaticamente le meta description sopra i 165 caratteri.
// Strategia: tagliare alla virgola/punto/dueDuePuntilucida più vicina sotto i 158 char.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function shorten(text, max = 158) {
  if (text.length <= max) return text;
  // Trova l'ultima virgola/punto/punto-virgola/due-punti dentro il limite
  const candidates = ['. ', '? ', '! ', '; ', ', ', ' — ', ' (', ' - '];
  let bestCut = -1;
  for (const sep of candidates) {
    const idx = text.lastIndexOf(sep, max);
    if (idx > bestCut && idx > max * 0.6) bestCut = idx + sep.trimEnd().length;
  }
  if (bestCut < 0) {
    // fallback: ultimo spazio sotto max-3
    bestCut = text.lastIndexOf(' ', max - 3);
    if (bestCut < 0) bestCut = max - 3;
  }
  return text.slice(0, bestCut).trimEnd().replace(/[,;:]$/, '') + '.';
}

let totalFixed = 0;

// ─── 1. Articoli MDX ──────────────────────────────────────────────
const articoliDir = path.join(projectRoot, 'src/content/articoli');
for (const f of fs.readdirSync(articoliDir).filter(n => n.endsWith('.mdx'))) {
  const fp = path.join(articoliDir, f);
  let content = fs.readFileSync(fp, 'utf-8');
  const m = content.match(/^(metaDescription:\s*)"([^"]+)"$/m);
  if (m && m[2].length > 165) {
    const shortened = shorten(m[2]);
    content = content.replace(m[0], `${m[1]}"${shortened}"`);
    fs.writeFileSync(fp, content, 'utf-8');
    console.log(`✓ ${f}: ${m[2].length}c → ${shortened.length}c`);
    totalFixed++;
  }
}

// ─── 2. .astro files (pillar hub + special pages) ────────────────────
const astroFiles = [
  'src/pages/index.astro',
  'src/pages/normativa/index.astro',
  'src/pages/prezzi/index.astro',
  'src/pages/marche/index.astro',
  'src/pages/trasporto/index.astro',
  'src/pages/vivere/index.astro',
  'src/pages/dove-mettere/index.astro',
  'src/pages/tipologie/index.astro',
  'src/pages/guide-acquisto/index.astro',
  'src/pages/community.astro',
  'src/pages/strumenti.astro',
  'src/pages/mappa-campeggi.astro',
  'src/pages/404.astro',
  // articles still .astro
  'src/pages/prezzi/listino-argus-modelli.astro',
  'src/pages/trasporto/scorta-tecnica-costi-km.astro',
];

for (const rel of astroFiles) {
  const fp = path.join(projectRoot, rel);
  if (!fs.existsSync(fp)) continue;
  let content = fs.readFileSync(fp, 'utf-8');
  // Pattern: const description = '...'  o  "..."  con possibili \' \" escape
  const m = content.match(/const\s+description\s*=\s*(['"])((?:[^\\]|\\.)*?)\1/m);
  if (m) {
    // Unescape the string
    let actualText = m[2];
    if (m[1] === "'") actualText = actualText.replace(/\\'/g, "'");
    actualText = actualText.replace(/\\"/g, '"');
    if (actualText.length > 165) {
      const shortened = shorten(actualText);
      // Re-escape for the original quote style
      let escaped = shortened;
      if (m[1] === "'") escaped = escaped.replace(/'/g, "\\'");
      escaped = escaped.replace(/"/g, '\\"');
      content = content.replace(m[0], `const description = ${m[1]}${escaped}${m[1]}`);
      fs.writeFileSync(fp, content, 'utf-8');
      console.log(`✓ ${rel}: ${actualText.length}c → ${shortened.length}c`);
      totalFixed++;
    }
  }
}

// ─── 3. site.ts default ────────────────────────────────────────────
const siteFile = path.join(projectRoot, 'src/lib/site.ts');
if (fs.existsSync(siteFile)) {
  let content = fs.readFileSync(siteFile, 'utf-8');
  const m = content.match(/(defaultDescription:\s*)(['"])((?:[^\\]|\\.)*?)\2/);
  if (m) {
    let text = m[3];
    if (m[2] === "'") text = text.replace(/\\'/g, "'");
    text = text.replace(/\\"/g, '"');
    if (text.length > 165) {
      const shortened = shorten(text);
      let escaped = shortened;
      if (m[2] === "'") escaped = escaped.replace(/'/g, "\\'");
      escaped = escaped.replace(/"/g, '\\"');
      content = content.replace(m[0], `${m[1]}${m[2]}${escaped}${m[2]}`);
      fs.writeFileSync(siteFile, content, 'utf-8');
      console.log(`✓ site.ts defaultDescription: ${text.length}c → ${shortened.length}c`);
      totalFixed++;
    }
  }
}

console.log(`\nTotale meta description accorciate: ${totalFixed}`);

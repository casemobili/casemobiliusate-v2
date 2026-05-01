#!/usr/bin/env node
// Accorcia titoli > 70c rimuovendo " (2026)" / " 2026" / " (guida 2026)" alla fine quando possibile.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function shortenTitle(t) {
  let result = t;
  // Strip "(guida 2026)" e " (2026)" e " 2026"
  const patterns = [
    / \(guida \d{4}\)$/,
    / \(\d{4}\)$/,
    /:\s*\d{4}$/,
    /\s+\d{4}$/,
  ];
  for (const re of patterns) {
    if (result.length > 65 && re.test(result)) {
      result = result.replace(re, '').trim();
    }
  }
  return result;
}

let totalFixed = 0;

// MDX articoli
const dir = path.join(projectRoot, 'src/content/articoli');
for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.mdx'))) {
  const fp = path.join(dir, f);
  let content = fs.readFileSync(fp, 'utf-8');
  const m = content.match(/^titolo:\s*"([^"]+)"$/m);
  if (m && m[1].length > 70) {
    const shortened = shortenTitle(m[1]);
    if (shortened.length < m[1].length) {
      content = content.replace(m[0], `titolo: "${shortened}"`);
      fs.writeFileSync(fp, content, 'utf-8');
      console.log(`✓ ${f}: ${m[1].length}c → ${shortened.length}c`);
      totalFixed++;
    }
  }
}

// .astro pillar hubs + special
const astroFiles = [
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
  'src/pages/prezzi/listino-argus-modelli.astro',
  'src/pages/trasporto/scorta-tecnica-costi-km.astro',
];

for (const rel of astroFiles) {
  const fp = path.join(projectRoot, rel);
  if (!fs.existsSync(fp)) continue;
  let content = fs.readFileSync(fp, 'utf-8');
  const m = content.match(/const\s+title\s*=\s*(['"])((?:[^\\]|\\.)*?)\1/);
  if (m) {
    let actualText = m[2];
    if (m[1] === "'") actualText = actualText.replace(/\\'/g, "'");
    actualText = actualText.replace(/\\"/g, '"');
    if (actualText.length > 70) {
      const shortened = shortenTitle(actualText);
      if (shortened.length < actualText.length) {
        let escaped = shortened;
        if (m[1] === "'") escaped = escaped.replace(/'/g, "\\'");
        escaped = escaped.replace(/"/g, '\\"');
        content = content.replace(m[0], `const title = ${m[1]}${escaped}${m[1]}`);
        fs.writeFileSync(fp, content, 'utf-8');
        console.log(`✓ ${rel}: ${actualText.length}c → ${shortened.length}c`);
        totalFixed++;
      }
    }
  }
}

console.log(`\nTotale titoli accorciati: ${totalFixed}`);

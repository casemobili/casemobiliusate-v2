#!/usr/bin/env node
// Migrazione pagine generali (chi-siamo, contatti, privacy, ecc.) → MDX in src/content/pagine/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import TurndownService from 'turndown';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const pagesDir = path.join(projectRoot, 'src/pages');
const contentDir = path.join(projectRoot, 'src/content/pagine');

fs.mkdirSync(contentDir, { recursive: true });

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
});
turndown.keep(['table', 'thead', 'tbody', 'tr', 'td', 'th']);

// Pagine da migrare (escluse: 404, mappa-campeggi, strumenti, community — hanno logica complessa o componenti speciali)
const PAGES = [
  { file: 'chi-siamo.astro', slug: 'chi-siamo', breadcrumbName: 'Chi siamo', showInFooter: true, ordine: 1 },
  { file: 'contatti.astro', slug: 'contatti', breadcrumbName: 'Contatti', showInFooter: true, ordine: 2 },
  { file: 'privacy.astro', slug: 'privacy', breadcrumbName: 'Privacy', showInFooter: true, ordine: 3 },
  { file: 'affiliate-disclaimer.astro', slug: 'affiliate-disclaimer', breadcrumbName: 'Affiliate Disclaimer', showInFooter: true, ordine: 4 },
];

function extractStringConst(src, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*([\`'"])((?:[^\\\\]|\\\\.|\\n)*?)\\1\\s*;`, 's');
  const m = src.match(re);
  if (!m) return null;
  return m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\`/g, '`');
}

function extractBody(src) {
  // Cerca il contenuto principale - dentro <BaseLayout>...</BaseLayout> o il primo <div>
  const bodyMatch = src.match(/<BaseLayout[^>]*>([\s\S]*?)<\/BaseLayout>/);
  if (!bodyMatch) return null;
  let body = bodyMatch[1];

  // Rimuovi SchemaBreadcrumb (gestito dal layout dynamic)
  body = body.replace(/<SchemaBreadcrumb[\s\S]*?\/>/g, '');

  // Rimuovi wrapper div più esterno se ha class
  const outerDivRe = /^\s*<div\s+class="[^"]*"[^>]*>([\s\S]*)<\/div>\s*$/;
  const om = body.trim().match(outerDivRe);
  if (om) body = om[1];

  // Rimuovi eyebrow div
  body = body.replace(/<div\s+class="eyebrow[^"]*"[^>]*>[^<]*<\/div>/g, '');

  // Rimuovi il primo H1 (verrà generato dal layout dal frontmatter)
  body = body.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '');

  // Convert <br/> to actual breaks
  body = body.replace(/<br\s*\/?\s*>/g, '\n');

  return body.trim();
}

function extractH1(src) {
  // L'H1 può essere in JSX dinamico o testuale
  const m = src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!m) return null;
  // Strip JSX expressions
  let h1 = m[1].replace(/\{[^}]+\}/g, '').replace(/<[^>]+>/g, '').trim();
  return h1.replace(/\s+/g, ' ');
}

function yamlEscape(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

let ok = 0;
const errors = [];

for (const page of PAGES) {
  const filePath = path.join(pagesDir, page.file);
  if (!fs.existsSync(filePath)) {
    errors.push(`${page.file}: not found`);
    continue;
  }

  try {
    const src = fs.readFileSync(filePath, 'utf-8');
    const title = extractStringConst(src, 'title');
    const description = extractStringConst(src, 'description');
    const h1Raw = extractH1(src);
    const body = extractBody(src);

    if (!title || !description || !body) {
      errors.push(`${page.file}: missing title/description/body`);
      continue;
    }

    // Convert body HTML to markdown
    const mdBody = turndown.turndown(body);

    // Escape MDX-problematic characters (< followed by digit/space, > preceded by digit)
    const mdBodyEscaped = mdBody
      .replace(/<(?=[0-9\s\-=])/g, '&lt;')
      .replace(/(?<=[0-9])>(?=\d|%|\s)/g, '&gt;');

    const frontmatter = [
      '---',
      `titolo: "${yamlEscape(title)}"`,
      `metaDescription: "${yamlEscape(description)}"`,
      `slug: "${page.slug}"`,
      `breadcrumbName: "${yamlEscape(page.breadcrumbName)}"`,
      h1Raw ? `h1: "${yamlEscape(h1Raw)}"` : '',
      `template: "standard"`,
      `showInFooter: ${page.showInFooter}`,
      `showInHeader: false`,
      `ordine: ${page.ordine}`,
      `noindex: false`,
      '---',
    ].filter(Boolean).join('\n');

    const outFile = path.join(contentDir, `${page.slug}.mdx`);
    fs.writeFileSync(outFile, `${frontmatter}\n\n${mdBodyEscaped}\n`, 'utf-8');
    console.log(`✓ ${page.slug}.mdx (${title.length}c title)`);
    ok++;
  } catch (e) {
    errors.push(`${page.file}: ${e.message}`);
  }
}

console.log(`\nMigrati: ${ok} / Errori: ${errors.length}`);
if (errors.length) errors.forEach(e => console.log('  - ' + e));

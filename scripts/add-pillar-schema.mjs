#!/usr/bin/env node
// Aggiunge SchemaWebPage (CollectionPage) ai pillar hub.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const pagesDir = path.join(projectRoot, 'src/pages');

const PILLARS = ['normativa', 'prezzi', 'marche', 'trasporto', 'vivere', 'dove-mettere', 'tipologie', 'guide-acquisto'];

let modified = 0;

for (const pillar of PILLARS) {
  const filePath = path.join(pagesDir, pillar, 'index.astro');
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP: ${pillar}/index.astro non esiste`);
    continue;
  }

  let src = fs.readFileSync(filePath, 'utf-8');

  // Skip se già contiene SchemaWebPage
  if (src.includes('SchemaWebPage')) {
    console.log(`SKIP: ${pillar} già aggiornato`);
    continue;
  }

  // 1. Aggiungere import (subito dopo SchemaBreadcrumb)
  src = src.replace(
    /import SchemaBreadcrumb from '~\/components\/SchemaBreadcrumb\.astro';/,
    `import SchemaBreadcrumb from '~/components/SchemaBreadcrumb.astro';\nimport SchemaWebPage from '~/components/SchemaWebPage.astro';`
  );

  // 2. Aggiungere il componente subito dopo <SchemaBreadcrumb ... />
  // Pattern: <SchemaBreadcrumb items={[...]} />
  const breadcrumbRe = /(<SchemaBreadcrumb\s+items=\{[\s\S]*?\}\s*\/>)/;
  if (breadcrumbRe.test(src)) {
    src = src.replace(breadcrumbRe, `$1\n    <SchemaWebPage type="CollectionPage" title={title} description={description} url={url} />`);
    fs.writeFileSync(filePath, src, 'utf-8');
    console.log(`✓ ${pillar}/index.astro aggiornato`);
    modified++;
  } else {
    console.log(`⚠ ${pillar}: SchemaBreadcrumb pattern non trovato`);
  }
}

console.log(`\nModificati: ${modified} / ${PILLARS.length}`);

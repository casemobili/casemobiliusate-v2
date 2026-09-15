#!/usr/bin/env node
// Genera la versione Markdown di ogni pagina HTML del build.
//
// Gira DOPO `astro build` (vedi package.json → "build"). Per ogni dist/<path>.html
// scrive dist/<path>.md con lo stesso contenuto in Markdown, così che:
//   1. functions/_middleware.ts possa servirlo quando un agente manda Accept: text/markdown
//   2. lo stesso file sia raggiungibile direttamente come /<path>.md
//
// NON deve mai far fallire il build: ogni pagina è isolata in try/catch e lo script
// esce comunque 0. Una pagina che non converte resta servita in HTML, nient'altro.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import TurndownService from 'turndown';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const SITE = 'https://www.casemobiliusate.com';

// Pagine escluse: area CMS, errori, bozze. Stessa logica del filtro sitemap.
const SKIP = [/^admin\//, /^404\./, /^draft\//, /^grazie\./];

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
});

// Raccoglie i discendenti per tag camminando i childNodes: il DOM che turndown
// passa alle rule (domino) non espone querySelectorAll sui nodi.
function descendantsByTag(node, tags) {
  const wanted = new Set(tags.map((t) => t.toUpperCase()));
  const found = [];
  const visit = (n) => {
    for (const child of n.childNodes || []) {
      if (child.nodeType !== 1) continue;
      if (wanted.has(child.nodeName.toUpperCase())) found.push(child);
      visit(child);
    }
  };
  visit(node);
  return found;
}

// Turndown di suo scarta le tabelle: qui servono, sono il formato in cui stanno
// i dati di prezzo che un agente vuole citare. Conversione a tabella GFM.
turndown.addRule('tables', {
  filter: 'table',
  replacement: (_content, node) => {
    const rows = descendantsByTag(node, ['tr']);
    if (rows.length === 0) return '';
    const cellText = (cell) =>
      turndown.turndown(cell.innerHTML || '').replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim();
    const matrix = rows.map((r) => descendantsByTag(r, ['th', 'td']).map(cellText));
    const width = Math.max(...matrix.map((r) => r.length));
    const pad = (r) => [...r, ...Array(width - r.length).fill('')];
    const [head, ...body] = matrix;
    const lines = [
      `| ${pad(head).join(' | ')} |`,
      `| ${Array(width).fill('---').join(' | ')} |`,
      ...body.map((r) => `| ${pad(r).join(' | ')} |`),
    ];
    return `\n\n${lines.join('\n')}\n\n`;
  },
});

// Link e immagini diventano assoluti: il .md viene letto fuori dal contesto del sito.
turndown.addRule('absoluteLinks', {
  filter: (node) => node.nodeName === 'A' && node.getAttribute('href')?.startsWith('/'),
  replacement: (content, node) => {
    const href = node.getAttribute('href');
    return content ? `[${content}](${SITE}${href})` : '';
  },
});

turndown.addRule('absoluteImages', {
  filter: (node) => node.nodeName === 'IMG' && node.getAttribute('src')?.startsWith('/'),
  replacement: (_content, node) =>
    `![${node.getAttribute('alt') || ''}](${SITE}${node.getAttribute('src')})`,
});

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

function extract(html, regex) {
  const m = html.match(regex);
  return m ? m[1].trim() : '';
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function htmlToMarkdown(html, urlPath) {
  const title = decode(extract(html, /<title>([\s\S]*?)<\/title>/i));
  const description = decode(extract(html, /<meta\s+name="description"\s+content="([^"]*)"/i));
  const updated = extract(html, /"dateModified"\s*:\s*"([^"]+)"/);

  // Solo il contenuto: header, nav e footer sono identici su ogni pagina e
  // moltiplicherebbero per 100 la stessa lista di link.
  let main = extract(html, /<main[^>]*>([\s\S]*?)<\/main>/i);
  if (!main) return null;

  main = main
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<button[\s\S]*?<\/button>/gi, '');

  let body = turndown.turndown(main);
  body = body.replace(/\n{3,}/g, '\n\n').trim();
  if (body.length < 120) return null;

  // Se il contenuto ha già il suo H1, il titolo resta solo un metadato: due H1
  // di fila confondono chi legge il file fuori dal sito.
  const bodyHasH1 = /^#\s/m.test(body);

  const head = [
    title ? (bodyHasH1 ? `Titolo: ${title}` : `# ${title}`) : '',
    '',
    description ? `> ${description}` : '',
    '',
    `URL: ${SITE}${urlPath}`,
    updated ? `Ultimo aggiornamento: ${updated.slice(0, 10)}` : '',
    'Fonte: CaseMobiliUsate.com — CMU Edizioni. Contenuto tecnico indipendente, nessuna vendita.',
    '',
    '---',
    '',
  ]
    .filter((l) => l !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  return `${head}${body}\n`;
}

let written = 0;
let skipped = 0;
let failed = 0;

try {
  if (!fs.existsSync(distDir)) {
    console.log('generate-markdown: nessuna dist/, salto.');
    process.exit(0);
  }

  for (const file of walk(distDir)) {
    const rel = path.relative(distDir, file);
    if (SKIP.some((re) => re.test(rel))) {
      skipped++;
      continue;
    }
    try {
      const html = fs.readFileSync(file, 'utf-8');
      const urlPath = '/' + rel.replace(/\.html$/, '').replace(/^index$/, '');
      const md = htmlToMarkdown(html, urlPath === '/index' ? '/' : urlPath);
      if (!md) {
        skipped++;
        continue;
      }
      fs.writeFileSync(file.replace(/\.html$/, '.md'), md, 'utf-8');
      written++;
    } catch (e) {
      failed++;
      console.warn(`generate-markdown: salto ${rel} — ${e.message}`);
    }
  }

  console.log(`generate-markdown: ${written} file .md scritti, ${skipped} saltati, ${failed} falliti.`);
} catch (e) {
  console.warn(`generate-markdown: errore non fatale — ${e.message}`);
}

process.exit(0);

#!/usr/bin/env node
// Migrazione automatica articoli .astro → MDX nelle Content Collections.
// Estrae frontmatter (titolo, descrizione, faq, tldr, date) e conserva body JSX così com'è.
// MDX supporta JSX inline → no conversione manuale di Tldr/FbCommunityWidget/FaqAccordion.
//
// Uso: node scripts/migrate-articles.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
});

// Mantieni tag custom-component (es. FbCommunityWidget) inalterati
turndown.keep(['table', 'thead', 'tbody', 'tr', 'td', 'th']);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const pagesDir = path.join(projectRoot, 'src/pages');
const contentDir = path.join(projectRoot, 'src/content/articoli');

const PILLARS = ['normativa', 'prezzi', 'marche', 'trasporto', 'vivere', 'dove-mettere', 'tipologie', 'guide-acquisto'];

// ──────────────────────────────────────────────────────────────────────
// Helper functions
// ──────────────────────────────────────────────────────────────────────

function listAstroFiles(pillarDir) {
  if (!fs.existsSync(pillarDir)) return [];
  const entries = fs.readdirSync(pillarDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === 'regioni') {
      // includi anche i sotto-articoli regionali
      const sub = fs.readdirSync(path.join(pillarDir, 'regioni'), { withFileTypes: true });
      for (const s of sub) {
        if (s.isFile() && s.name.endsWith('.astro')) {
          files.push({ path: path.join(pillarDir, 'regioni', s.name), subpath: 'regioni/' + s.name });
        }
      }
    } else if (entry.isFile() && entry.name.endsWith('.astro') && entry.name !== 'index.astro') {
      files.push({ path: path.join(pillarDir, entry.name), subpath: entry.name });
    }
  }
  return files;
}

function extractStringConst(src, name) {
  // Match: const X = '...';  or  const X = "...";  or  const X = `...`;
  const re = new RegExp(`const\\s+${name}\\s*=\\s*([\`'"])((?:[^\\\\]|\\\\.|\\n)*?)\\1\\s*;`, 's');
  const m = src.match(re);
  if (!m) return null;
  // unescape backticks/quotes
  return m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\`/g, '`').replace(/\\n/g, '\n');
}

function extractFaqArray(src) {
  // Match: const faq = [ ... ];
  // Estraiamo TUTTO l'array, poi parsiamo manualmente
  const re = /const\s+faq\s*=\s*(\[[\s\S]*?\n\]);/m;
  const m = src.match(re);
  if (!m) return [];

  const arrayText = m[1];
  // Pattern per ogni elemento: { q: '...', a: '...' }
  const itemRe = /\{\s*q\s*:\s*(['"`])([\s\S]*?)\1\s*,\s*a\s*:\s*(['"`])([\s\S]*?)\3\s*\}/g;
  const items = [];
  let im;
  while ((im = itemRe.exec(arrayText)) !== null) {
    items.push({
      domanda: im[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\`/g, '`'),
      risposta: im[4].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\`/g, '`'),
    });
  }
  return items;
}

function extractSchemaDate(src, attr) {
  // datePublished="2026-04-29" or dateModified="2026-04-29"
  const re = new RegExp(`${attr}="([0-9]{4}-[0-9]{2}-[0-9]{2})"`);
  const m = src.match(re);
  return m ? m[1] : null;
}

function extractTldrHtml(src) {
  // <Tldr>\n  <p ...>HTML INTERNO</p>\n</Tldr>
  const re = /<Tldr[^>]*>\s*([\s\S]*?)\s*<\/Tldr>/;
  const m = src.match(re);
  if (!m) return null;
  // Prendi il testo, rimuovi il primo <p ...> e l'ultimo </p>
  let inner = m[1].trim();
  inner = inner.replace(/^<p[^>]*>/, '').replace(/<\/p>$/, '');
  return inner.trim();
}

function extractReadingTime(src) {
  const re = /(\d+)\s*min\s*di\s*lettura/i;
  const m = src.match(re);
  return m ? parseInt(m[1], 10) : 5;
}

function extractCoverImage(src) {
  // Cerca <img src="/images/..." ...> dentro <figure> o <header>
  const re = /<img\s+src="([^"]+)"\s+alt="([^"]+)"[^>]*?>/;
  const m = src.match(re);
  if (!m) return { coverImage: undefined, coverImageAlt: undefined };
  return { coverImage: m[1], coverImageAlt: m[2] };
}

function extractCoverImageCredit(src) {
  // <figcaption ...>Foto: ...</figcaption>
  const re = /<figcaption[^>]*>([^<]*)<\/figcaption>/;
  const m = src.match(re);
  return m ? m[1].trim() : undefined;
}

function extractBodyContent(src) {
  // Trova il contenuto dentro <article>...</article>
  // Poi rimuovi: SchemaBreadcrumb, header, Tldr (estratti separatamente), <aside>, hr finale, schema info paragrafo
  const articleMatch = src.match(/<article[^>]*>([\s\S]*?)<\/article>/);
  if (!articleMatch) return null;

  let body = articleMatch[1];

  // Rimuovi SchemaBreadcrumb (gestito dal layout)
  body = body.replace(/<SchemaBreadcrumb[\s\S]*?\/>/g, '');

  // Rimuovi header iniziale (titolo, sottotitolo, autore, data, eyebrow) — gestito dal layout
  body = body.replace(/<header[\s\S]*?<\/header>/, '');

  // Rimuovi sidebar aside
  body = body.replace(/<aside[\s\S]*?<\/aside>/g, '');

  // Rimuovi il wrapper grid lg:grid-cols-12 / div col-span — semplifica
  body = body.replace(/<div\s+class="grid[^"]*">/g, '');
  body = body.replace(/<div\s+class="lg:col-span-8[^"]*"[^>]*>/g, '');
  // Rimuovi anche il wrapper prose-article (gestito dal layout dynamic)
  body = body.replace(/<div\s+class="[^"]*prose-article[^"]*"[^>]*>/g, '');

  // Rimuovi tag </div> orfani che restano dopo le sostituzioni
  // Si fa con bilanciamento approssimativo — rimuoviamo gli ultimi </div> alla fine se ce ne sono troppi
  // Per sicurezza, lasciamo i div interni ma rimuoviamo solo i primi 2 div esterni se presenti

  // Rimuovi il primo Tldr (estratto separatamente) — se è il primo elemento del body
  body = body.replace(/<Tldr[^>]*>[\s\S]*?<\/Tldr>/, '');

  // Rimuovi FbCommunityWidget — viene aggiunto dal layout dynamic
  body = body.replace(/<FbCommunityWidget[\s\S]*?\/>/g, '');

  // Rimuovi FaqAccordion — viene aggiunto dal layout dynamic
  body = body.replace(/<FaqAccordion[\s\S]*?\/>/g, '');

  // Rimuovi paragrafo finale di "Le informazioni di questo articolo..."
  body = body.replace(/<hr\s*\/?>\s*<p[^>]*>\s*Le informazioni di questo articolo[\s\S]*?<\/p>/g, '');

  // Rimuovi orphan </div> alla fine (rimasti dai wrapper grid eliminati)
  body = body.replace(/(<\/div>\s*){1,5}\s*$/g, '');

  // Trim
  body = body.trim();

  // Sostituisci tag <hr /> finali residui
  body = body.replace(/<hr\s*\/?>\s*$/g, '');

  // Detect JSX expressions: {X.map}, {X.filter}, {X(args)}, etc — non risolvibili in MDX statico
  const jsxExprs = body.match(/\{[a-zA-Z_$][\w$]*\.(map|filter|find|reduce|forEach|some|every)\(/g);
  if (jsxExprs && jsxExprs.length > 0) {
    return null; // segnala come non-migrabile
  }

  // Converti HTML in Markdown via Turndown (gestisce nested correttamente)
  body = turndown.turndown(body);

  // Escape MDX-problematic characters:
  // - `<` seguito da numero/spazio/segno (es. <15%, < 100, <- arrow): escape a &lt;
  body = body.replace(/<(?=[0-9\s\-=])/g, '&lt;');
  // - `>` solo se è in fine riga o seguito da segno (es. >25%): escape a &gt;
  body = body.replace(/(?<=[0-9])>(?=\d|%|\s)/g, '&gt;');

  return body.trim();
}

function htmlToMarkdown(html) {
  let md = html;

  // Headings
  md = md.replace(/<h2[^>]*>\s*([\s\S]*?)\s*<\/h2>/g, '\n\n## $1\n\n');
  md = md.replace(/<h3[^>]*>\s*([\s\S]*?)\s*<\/h3>/g, '\n\n### $1\n\n');
  md = md.replace(/<h4[^>]*>\s*([\s\S]*?)\s*<\/h4>/g, '\n\n#### $1\n\n');

  // Strong, em
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/g, '**$1**');
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/g, '*$1*');

  // Links
  md = md.replace(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)');

  // Code inline
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/g, '`$1`');

  // Liste — gestione semplice (un solo livello)
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, (_, inner) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(m => `- ${m[1].trim()}`);
    return '\n\n' + items.join('\n') + '\n\n';
  });
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (_, inner) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m, i) => `${i+1}. ${m[1].trim()}`);
    return '\n\n' + items.join('\n') + '\n\n';
  });

  // Paragraph
  md = md.replace(/<p[^>]*>\s*([\s\S]*?)\s*<\/p>/g, '\n\n$1\n\n');

  // Blockquote
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g, (_, inner) => {
    return '\n\n' + inner.trim().split('\n').map(l => '> ' + l).join('\n') + '\n\n';
  });

  // hr → ---
  md = md.replace(/<hr\s*\/?\s*>/g, '\n\n---\n\n');

  // Rimuovi div residui orfani (apertura/chiusura)
  md = md.replace(/<\/?div[^>]*>/g, '');

  // Rimuovi span residui ma conserva il testo
  md = md.replace(/<\/?span[^>]*>/g, '');

  // Rimuovi figure/figcaption (la cover image è nel frontmatter)
  md = md.replace(/<figure[^>]*>[\s\S]*?<\/figure>/g, '');

  // Rimuovi <br/> orfani
  md = md.replace(/<br\s*\/?\s*>/g, '\n');

  // Rimuovi tabelle complesse — preservale come HTML (MDX accetta tabelle HTML)
  // (lasciamo passare le table)

  // Cleanup: max 2 newline consecutive
  md = md.replace(/\n{3,}/g, '\n\n');

  // Trim
  md = md.trim();

  return md;
}

function deriveSlug(filename, subpath) {
  // marina-di-bibbona.astro → marina-di-bibbona
  // regioni/lazio.astro → regioni-lazio (ma manteniamo path)
  if (subpath.includes('regioni/')) {
    return 'regioni-' + path.basename(subpath, '.astro');
  }
  return path.basename(filename, '.astro');
}

function deriveLegacyPath(pillar, subpath) {
  // /normativa/casa-mobile-terreno-agricolo
  // /normativa/regioni/lazio
  return `/${pillar}/${subpath.replace(/\.astro$/, '')}`;
}

function tomlEscape(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function yamlEscape(s) {
  if (typeof s !== 'string') return s;
  // Per YAML in double-quoted: solo \ e " devono essere escapati
  // Rimuoviamo escape JS non necessari (\' resta letterale ', \n diventa newline reale)
  let out = s
    .replace(/\\'/g, "'")  // unescape single quotes (JS-style escape non necessario in YAML)
    .replace(/\\\\/g, '\\') // unescape doppi backslash
    .replace(/\\n/g, ' ')   // newline literali → space
    .replace(/\\/g, '\\\\') // re-escape any remaining backslash
    .replace(/"/g, '\\"');  // escape double quotes per YAML
  return out;
}

function buildFrontmatter(data) {
  const lines = ['---'];
  lines.push(`titolo: "${yamlEscape(data.titolo)}"`);
  if (data.sottotitolo) lines.push(`sottotitolo: "${yamlEscape(data.sottotitolo)}"`);
  lines.push(`pillar: "${data.pillar}"`);
  lines.push(`slug: "${data.slug}"`);
  if (data.legacyPath) lines.push(`legacyPath: "${data.legacyPath}"`);
  if (data.focusKeyword) lines.push(`focusKeyword: "${yamlEscape(data.focusKeyword)}"`);
  lines.push(`metaDescription: "${yamlEscape(data.metaDescription)}"`);
  if (data.coverImage) lines.push(`coverImage: "${data.coverImage}"`);
  if (data.coverImageAlt) lines.push(`coverImageAlt: "${yamlEscape(data.coverImageAlt)}"`);
  if (data.coverImageCredit) lines.push(`coverImageCredit: "${yamlEscape(data.coverImageCredit)}"`);
  lines.push(`dataPubblicazione: ${data.dataPubblicazione}`);
  if (data.dataAggiornamento) lines.push(`dataAggiornamento: ${data.dataAggiornamento}`);
  lines.push(`autore: "andrea-bressan"`);
  lines.push(`readingTime: ${data.readingTime}`);
  if (data.tldr) {
    lines.push(`tldr: "${yamlEscape(data.tldr.replace(/\n/g, ' '))}"`);
  }
  if (data.faq && data.faq.length > 0) {
    lines.push(`faq:`);
    for (const f of data.faq) {
      lines.push(`  - domanda: "${yamlEscape(f.domanda)}"`);
      lines.push(`    risposta: "${yamlEscape(f.risposta)}"`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────────────
// Main migration loop
// ──────────────────────────────────────────────────────────────────────

let migrated = 0;
let skipped = 0;
const errors = [];

for (const pillar of PILLARS) {
  const pillarDir = path.join(pagesDir, pillar);
  const files = listAstroFiles(pillarDir);
  console.log(`\n📁 ${pillar}: ${files.length} file da migrare`);

  for (const { path: filePath, subpath } of files) {
    try {
      const src = fs.readFileSync(filePath, 'utf-8');

      const titolo = extractStringConst(src, 'title');
      const description = extractStringConst(src, 'description');

      if (!titolo) {
        errors.push(`${filePath}: titolo non trovato`);
        skipped++;
        continue;
      }

      const slug = deriveSlug(filePath, subpath);
      const legacyPath = deriveLegacyPath(pillar, subpath);
      const faq = extractFaqArray(src);
      const tldr = extractTldrHtml(src);
      const dataPub = extractSchemaDate(src, 'datePublished') || '2026-04-29';
      const dataMod = extractSchemaDate(src, 'dateModified');
      const readingTime = extractReadingTime(src);
      const cover = extractCoverImage(src);
      const coverCredit = extractCoverImageCredit(src);
      const body = extractBodyContent(src);

      if (!body) {
        errors.push(`${filePath}: body non estratto`);
        skipped++;
        continue;
      }

      const data = {
        titolo,
        pillar,
        slug,
        legacyPath,
        metaDescription: description || `${titolo} — guida tecnica aggiornata 2026.`,
        coverImage: cover.coverImage,
        coverImageAlt: cover.coverImageAlt,
        coverImageCredit: coverCredit,
        dataPubblicazione: dataPub,
        dataAggiornamento: dataMod || dataPub,
        readingTime,
        tldr,
        faq,
      };

      const frontmatter = buildFrontmatter(data);
      const mdx = `${frontmatter}\n\n${body}\n`;

      const outFile = path.join(contentDir, `${slug}.mdx`);
      fs.writeFileSync(outFile, mdx, 'utf-8');
      migrated++;
      console.log(`  ✓ ${slug}.mdx`);
    } catch (e) {
      errors.push(`${filePath}: ${e.message}`);
      skipped++;
    }
  }
}

console.log(`\n=== RISULTATO ===`);
console.log(`Migrati: ${migrated}`);
console.log(`Skippati: ${skipped}`);
if (errors.length > 0) {
  console.log(`\nErrori:`);
  errors.forEach((e) => console.log(`  - ${e}`));
}

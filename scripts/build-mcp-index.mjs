#!/usr/bin/env node
// Genera l'indice del corpus che alimenta il server MCP (/mcp).
//
// Gira DOPO `astro build` e dopo generate-markdown.mjs: legge i .md già prodotti
// in dist/ e ne estrae titolo, descrizione, area tematica e data di aggiornamento.
//
// Il server MCP non legge il filesystem (su Cloudflare non esiste): interroga
// questo indice, che viene servito come asset statico. Da qui derivano sia la
// ricerca sia la whitelist dei path leggibili — un path non presente nell'indice
// non è leggibile, il che chiude alla radice ogni tentativo di path traversal.
//
// Come gli altri script di build, non deve mai far fallire il build.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const AREE = {
  normativa: 'Normativa e permessi',
  prezzi: 'Prezzi e valutazione',
  marche: 'Marche e modelli',
  trasporto: 'Trasporto e installazione',
  vivere: 'Vivere in casa mobile',
  'dove-mettere': 'Dove collocarla',
  tipologie: 'Confronti e tipologie',
  'guide-acquisto': "Guide all'acquisto",
};

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

try {
  if (!fs.existsSync(distDir)) {
    console.log('build-mcp-index: nessuna dist/, salto.');
    process.exit(0);
  }

  const pages = [];
  for (const file of walk(distDir)) {
    try {
      const rel = path.relative(distDir, file);
      // Fuori dall'indice: documentazione tecnica per agenti, non guide del corpus.
      if (rel.startsWith('.well-known') || rel === 'auth.md') continue;

      const text = fs.readFileSync(file, 'utf-8');
      const urlPath = '/' + rel.replace(/\.md$/, '').replace(/^index$/, '');
      const titolo =
        (text.match(/^Titolo:\s*(.+)$/m) || text.match(/^#\s+(.+)$/m) || [])[1]?.trim() || '';
      const descrizione = (text.match(/^>\s*(.+)$/m) || [])[1]?.trim() || '';
      const aggiornamento = (text.match(/^Ultimo aggiornamento:\s*(.+)$/m) || [])[1]?.trim() || '';
      const area = urlPath.split('/')[1] || '';

      if (!titolo) continue;

      pages.push({
        path: urlPath === '/index' ? '/' : urlPath,
        titolo,
        descrizione,
        area: AREE[area] || '',
        aggiornamento,
        // Testo ridotto per la ricerca: primi 2000 caratteri senza intestazione.
        estratto: text.replace(/^[\s\S]*?\n---\n/, '').replace(/\s+/g, ' ').slice(0, 2000),
      });
    } catch {
      /* una pagina che non si legge non deve fermare l'indice */
    }
  }

  pages.sort((a, b) => a.path.localeCompare(b.path));

  const out = path.join(distDir, 'mcp');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, 'corpus-index.json'),
    JSON.stringify({ generato: new Date().toISOString().slice(0, 10), pagine: pages }),
    'utf-8'
  );
  console.log(`build-mcp-index: ${pages.length} pagine indicizzate per il server MCP.`);
} catch (e) {
  console.warn(`build-mcp-index: errore non fatale — ${e.message}`);
}

process.exit(0);

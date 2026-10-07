#!/usr/bin/env node
// Decide che cosa pubblica questa uscita del workflow.
//
// Regola (decisa il 7 ottobre 2026): una pagina di statistiche al mese.
// Se nel mese corrente non è ancora uscita nessuna pagina con `dataset:` nel
// frontmatter e c'è ancora un tema libero in stats-themes.json, questa uscita
// è una pagina di statistiche. Altrimenti è un articolo normale.
// Così la prima uscita di ogni mese fa la pagina di dati, e se fallisce ci
// riprova l'uscita successiva (il workflow ripiega sull'articolo normale).
//
// FORCE_MODE=stats|article scavalca la regola (per le prove).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const articoliDir = path.join(projectRoot, 'src/content/articoli');

function decide() {
  if (process.env.FORCE_MODE === 'stats' || process.env.FORCE_MODE === 'article') {
    return { mode: process.env.FORCE_MODE, motivo: 'FORCE_MODE' };
  }
  const mese = new Date().toISOString().slice(0, 7);
  for (const f of fs.readdirSync(articoliDir)) {
    if (!f.endsWith('.mdx')) continue;
    const fm = fs.readFileSync(path.join(articoliDir, f), 'utf-8').split(/\n---\n/)[0];
    const pub = (fm.match(/^dataPubblicazione:\s*"?(\d{4}-\d{2})/m) || [])[1];
    if (/^dataset:/m.test(fm) && pub === mese) {
      return { mode: 'article', motivo: `pagina di statistiche del ${mese} già uscita (${f})` };
    }
  }
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'stats-themes.json'), 'utf-8'));
  if (config.attivo !== true) return { mode: 'article', motivo: 'pagine di statistiche spente in stats-themes.json (attivo: false)' };
  const temi = config.temi;
  const libero = temi.find((t) => !fs.existsSync(path.join(articoliDir, `${t.slug}.mdx`)));
  if (!libero) return { mode: 'article', motivo: 'nessun tema libero in stats-themes.json' };
  return { mode: 'stats', motivo: `nessuna pagina di statistiche nel ${mese}; tema: ${libero.slug}` };
}

const { mode, motivo } = decide();
console.log(`Modalità: ${mode} (${motivo})`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`);

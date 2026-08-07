#!/usr/bin/env node
/*
  Genera tutto il set di icone del marchio CaseMobiliUsate.
    node scripts/generate-icons.mjs

  Il marchio e' la casa mobile SU RUOTE approvata da Mattia: generata in Canva
  (design "Compact Prefab House Logo Design 1", DAHRnjYyvQ4) e poi ricalcata qui
  in vettoriale con la palette del sito. Casa vera — tetto, porta, finestre — su
  due ruote: deve leggersi come un'abitazione che sta su ruote, non un veicolo.

  Tre accorgimenti che il semplice "scala l'SVG" non darebbe:

  1. ARTE SPECIFICA PER TAGLIA. A 16px un'unita' del viewBox 64 vale 0,25px:
     finestre e pannelli della porta si impastano e le ruote spariscono. Il 16px
     usa una versione semplificata, con ruote piu' grandi e piu' staccate.
  2. MASKABLE. Android/iOS ritagliano un cerchio: per 180/192/512 il marchio
     e' rientrato all'80% attorno al centro e lo sfondo e' a angoli vivi.
  3. Sorgente unica: si modifica il marchio qui e in public/favicon.svg.

  Dopo ogni ridisegno va incrementato ?v=N in BaseLayout.astro e nel manifest,
  altrimenti CDN e browser continuano a servire le icone vecchie.
*/
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');

const FOREST = '#1F2A1B';
const BRASS = '#B89653';
const LINEN = '#FAF7F0';

// Piena: tetto con gronda e ritorni, finestre, porta a pannelli col gradino,
// ruote complete di anello di stacco e mozzo. Da 32px in su.
const MARK_FULL = `
  <path d="M32 9.5 L58.5 18 H5.5 Z" fill="${FOREST}"/>
  <rect x="5.5" y="18" width="3.4" height="3" fill="${FOREST}"/>
  <rect x="55.1" y="18" width="3.4" height="3" fill="${FOREST}"/>
  <rect x="9" y="18" width="46" height="31" fill="${FOREST}"/>
  <rect x="9" y="49" width="3.4" height="3.6" fill="${FOREST}"/>
  <rect x="51.6" y="49" width="3.4" height="3.6" fill="${FOREST}"/>
  <rect x="15.9" y="23" width="7" height="6" fill="${BRASS}"/>
  <rect x="41.1" y="23" width="7" height="6" fill="${BRASS}"/>
  <rect x="27" y="23" width="10.4" height="21" fill="${BRASS}"/>
  <rect x="30" y="25.4" width="1.4" height="8.2" fill="${FOREST}"/>
  <rect x="32.6" y="25.4" width="1.4" height="8.2" fill="${FOREST}"/>
  <rect x="27" y="45" width="10.4" height="2.2" fill="${BRASS}"/>
  <circle cx="19.2" cy="49" r="6.4" fill="${LINEN}"/>
  <circle cx="44.8" cy="49" r="6.4" fill="${LINEN}"/>
  <circle cx="19.2" cy="49" r="5.4" fill="${FOREST}"/>
  <circle cx="44.8" cy="49" r="5.4" fill="${FOREST}"/>
  <circle cx="19.2" cy="49" r="2.1" fill="${LINEN}"/>
  <circle cx="44.8" cy="49" r="2.1" fill="${LINEN}"/>`;

// Semplificata per il 16px: via finestre, pannelli e mozzi. Corpo piu' basso
// per dare aria alle ruote, che sono piu' grandi e con l'anello di stacco piu'
// spesso — altrimenti a quella taglia si fondono col corpo e spariscono.
const MARK_SIMPLE = `
  <path d="M32 10 L59 19 H5 Z" fill="${FOREST}"/>
  <rect x="9" y="19" width="46" height="26" fill="${FOREST}"/>
  <rect x="26" y="25" width="12" height="20" fill="${BRASS}"/>
  <circle cx="19" cy="47" r="7.6" fill="${LINEN}"/>
  <circle cx="45" cy="47" r="7.6" fill="${LINEN}"/>
  <circle cx="19" cy="47" r="6.2" fill="${FOREST}"/>
  <circle cx="45" cy="47" r="6.2" fill="${FOREST}"/>`;

const tab = (mark) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${LINEN}"/>${mark}</svg>`;

const maskable = (mark) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${LINEN}"/>
  <g transform="translate(32,32) scale(0.8) translate(-32,-32)">${mark}</g></svg>`;

const jobs = [
  [tab(MARK_SIMPLE), 16, 'favicon-16x16.png'],
  [tab(MARK_FULL), 32, 'favicon-32x32.png'],
  [tab(MARK_FULL), 48, 'favicon-48x48.png'],
  [tab(MARK_FULL), 64, 'favicon-64x64.png'],
  [maskable(MARK_FULL), 180, 'apple-touch-icon.png'],
  [maskable(MARK_FULL), 192, 'favicon-192x192.png'],
  [maskable(MARK_FULL), 512, 'favicon-512x512.png'],
];

for (const [svg, size, file] of jobs) {
  await sharp(Buffer.from(svg), { density: 512 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(pub, file));
  console.log(`${file.padEnd(24)} ${String(fs.statSync(path.join(pub, file)).size).padStart(6)} byte`);
}
console.log('\nSet icone rigenerato. Ricordati di incrementare ?v=N se il marchio e cambiato.');

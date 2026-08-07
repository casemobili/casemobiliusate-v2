#!/usr/bin/env node
/*
  Genera tutto il set di icone del marchio CaseMobiliUsate.
    node scripts/generate-icons.mjs

  Tre accorgimenti che il semplice "scala l'SVG" non darebbe:

  1. ARTE SPECIFICA PER TAGLIA. A 16px un'unita' del viewBox 64 vale 0,25px:
     fascia finestre e porta si impastano. Il 16px usa quindi una versione
     semplificata (stessa sagoma, senza finestra), gli altri la versione piena.
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
const GRAD = `<linearGradient id="cmu" x1="32" y1="17" x2="32" y2="46" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#E6D094"/><stop offset="1" stop-color="#B89653"/>
  </linearGradient>`;

// Disegnato sulla referenza fotografica reale (public/images/hero-casa-mobile.jpg).
// Le tre cose che fanno la differenza rispetto a un'icona generica di casa:
// tetto come fascia STACCATA (materiale diverso dal rivestimento), corpo molto
// lungo e basso con gronda sporgente, unita' SOLLEVATA da terra sugli appoggi.
const ROOF = `<path d="M25 17 H39 L59 24 H5 Z" fill="url(#cmu)"/>`;
const BASE = `<rect x="12" y="43" width="40" height="3" rx="1.5" fill="url(#cmu)" opacity="0.9"/>`;

// Piena: finestre a nastro + porta stretta in fondo (facciata asimmetrica). Da 32px.
const MARK_FULL = `${ROOF}
  <rect x="9" y="26.5" width="46" height="14" rx="1" fill="url(#cmu)"/>
  <rect x="13" y="30" width="30" height="6" rx="1.5" fill="${FOREST}"/>
  <rect x="46" y="30" width="6" height="10.5" rx="1" fill="${FOREST}"/>
  ${BASE}`;

// Semplificata per il 16px. A quella taglia lo stacco del tetto e quello della
// base valgono mezzo pixel: diventano sporcizia. Qui tetto e corpo sono una
// silhouette continua e la porta e' un intaglio sul bordo (un intaglio
// sopravvive dove un foro interno si impasta). Niente basamento.
const MARK_SIMPLE = `<path d="M25 19 H39 L59 26 H5 Z" fill="url(#cmu)"/>
  <path d="M9 26 H55 V42 H49 V33 H41 V42 H9 Z" fill="url(#cmu)"/>`;

const tab = (mark) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>${GRAD}</defs><rect width="64" height="64" rx="14" fill="${FOREST}"/>${mark}</svg>`;

const maskable = (mark) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>${GRAD}</defs><rect width="64" height="64" fill="${FOREST}"/>
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

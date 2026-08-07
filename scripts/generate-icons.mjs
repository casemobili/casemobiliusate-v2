#!/usr/bin/env node
/*
  Genera tutto il set di icone da public/favicon.svg.
    node scripts/generate-icons.mjs

  Due sorgenti distinte, non una sola scalata:
  - tab/desktop: il marchio riempie la tela (leggibile a 16px)
  - maskable (Android/PWA): marchio all'80% attorno al centro, così resta
    dentro la safe zone circolare che il sistema operativo ritaglia.
*/
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');

const FOREST = '#1F2A1B';
const MARK = `
  <path d="M25 16 H39 L54 31 H10 Z" fill="url(#cmu)"/>
  <path d="M14 31 H50 V49 H37.5 V38.5 H26.5 V49 H14 Z" fill="url(#cmu)"/>`;
const GRAD = `
  <linearGradient id="cmu" x1="32" y1="16" x2="32" y2="49" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#E6D094"/>
    <stop offset="1" stop-color="#B89653"/>
  </linearGradient>`;

const standard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>${GRAD}</defs>
  <rect width="64" height="64" rx="14" fill="${FOREST}"/>${MARK}
</svg>`;

// Angoli vivi (li arrotonda iOS) e marchio rientrato: safe zone maskable.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>${GRAD}</defs>
  <rect width="64" height="64" fill="${FOREST}"/>
  <g transform="translate(32,32) scale(0.8) translate(-32,-32)">${MARK}</g>
</svg>`;

const render = (svg, size, file) =>
  sharp(Buffer.from(svg), { density: 512 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(pub, file));

const jobs = [
  [standard, 16, 'favicon-16x16.png'],
  [standard, 32, 'favicon-32x32.png'],
  [standard, 48, 'favicon-48x48.png'],
  [standard, 64, 'favicon-64x64.png'],
  [maskable, 180, 'apple-touch-icon.png'],
  [maskable, 192, 'favicon-192x192.png'],
  [maskable, 512, 'favicon-512x512.png'],
];

for (const [svg, size, file] of jobs) {
  await render(svg, size, file);
  console.log(`${file.padEnd(24)} ${String(fs.statSync(path.join(pub, file)).size).padStart(6)} byte`);
}
console.log('\nSet icone rigenerato da public/favicon.svg');

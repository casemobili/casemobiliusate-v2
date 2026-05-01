#!/usr/bin/env node
// Generate social/favicon assets for SEO indexability:
// - apple-touch-icon.png (180x180)
// - favicon-32x32.png, favicon-16x16.png
// - og-default.jpg (1200x630)
// - manifest.webmanifest

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');

const FAVICON_SVG = fs.readFileSync(path.join(publicDir, 'favicon.svg'), 'utf-8');

// ─── 1. Apple Touch Icon (180x180) ───────────────────────────────────
const appleIconBuffer = await sharp(Buffer.from(FAVICON_SVG))
  .resize(180, 180)
  .png()
  .toBuffer();
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleIconBuffer);
console.log('✓ apple-touch-icon.png (180×180)');

// ─── 2. Favicon PNG variants ──────────────────────────────────────────
for (const size of [16, 32, 48, 64, 192, 512]) {
  const buf = await sharp(Buffer.from(FAVICON_SVG))
    .resize(size, size)
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(publicDir, `favicon-${size}x${size}.png`), buf);
}
console.log('✓ favicon-{16,32,48,64,192,512}x.png');

// ─── 3. OG Default Image (1200×630) ───────────────────────────────────
// Crea un SVG dinamico con logo + tagline del sito
const OG_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1F2A1B"/>
      <stop offset="100%" stop-color="#2D5A3D"/>
    </linearGradient>
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(212,179,101,0.06)" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>

  <!-- Logo (rectangle + simbolo) -->
  <g transform="translate(80, 80)">
    <rect width="80" height="80" rx="8" fill="#D4B365" opacity="0.95"/>
    <!-- Tetto stilizzato (casa) -->
    <path d="M20 30 L40 18 L60 30" stroke="#1F2A1B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <!-- "C" stilizzata grande -->
    <path d="M55 44 C55 34, 48 28, 40 28 C30 28, 24 35, 24 45 C24 55, 30 62, 40 62 C48 62, 55 56, 55 46" stroke="#1F2A1B" stroke-width="4" stroke-linecap="round" fill="none"/>
  </g>

  <!-- Sito name -->
  <text x="180" y="120" font-family="Georgia, 'Cormorant Garamond', serif" font-size="38" font-weight="600" fill="#FAF7F0">CaseMobiliUsate</text>
  <text x="180" y="158" font-family="system-ui, sans-serif" font-size="18" font-weight="500" fill="#D4B365" letter-spacing="3">.COM</text>

  <!-- Headline -->
  <text x="80" y="320" font-family="Georgia, 'Cormorant Garamond', serif" font-size="64" font-weight="600" fill="#FAF7F0">Case mobili usate</text>
  <text x="80" y="395" font-family="Georgia, 'Cormorant Garamond', serif" font-size="64" font-weight="600" font-style="italic" fill="#D4B365">in Italia</text>

  <!-- Subhead -->
  <text x="80" y="465" font-family="system-ui, sans-serif" font-size="26" font-weight="400" fill="rgba(250,247,240,0.85)">Guide tecniche, normativa, prezzi reali.</text>
  <text x="80" y="498" font-family="system-ui, sans-serif" font-size="26" font-weight="400" fill="rgba(250,247,240,0.85)">Sito indipendente, senza vendita.</text>

  <!-- Footer line -->
  <line x1="80" y1="560" x2="1120" y2="560" stroke="#D4B365" stroke-width="1" opacity="0.4"/>
  <text x="80" y="595" font-family="system-ui, sans-serif" font-size="18" font-weight="500" fill="#D4B365" letter-spacing="2">CMU EDIZIONI · 2026</text>

  <!-- Decorative circles -->
  <circle cx="1050" cy="380" r="100" fill="rgba(212,179,101,0.08)"/>
  <circle cx="1050" cy="380" r="70" fill="rgba(212,179,101,0.12)"/>
  <circle cx="1050" cy="380" r="40" fill="rgba(212,179,101,0.18)"/>
</svg>
`;

const ogBuffer = await sharp(Buffer.from(OG_SVG))
  .jpeg({ quality: 88, progressive: true })
  .toBuffer();
fs.writeFileSync(path.join(publicDir, 'og-default.jpg'), ogBuffer);
console.log('✓ og-default.jpg (1200×630, ' + Math.round(ogBuffer.length / 1024) + 'KB)');

// ─── 4. Manifest.webmanifest ──────────────────────────────────────────
const manifest = {
  name: 'CaseMobiliUsate.com',
  short_name: 'CMU',
  description: 'Guide tecniche, normative aggiornate, prezzi reali e strumenti pratici sulle case mobili usate in Italia.',
  start_url: '/',
  display: 'minimal-ui',
  orientation: 'portrait-primary',
  background_color: '#FAF7F0',
  theme_color: '#1F2A1B',
  lang: 'it',
  scope: '/',
  icons: [
    { src: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    { src: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    { src: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
    { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    { src: '/favicon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: '/favicon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
  categories: ['lifestyle', 'travel', 'reference'],
};
fs.writeFileSync(path.join(publicDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
console.log('✓ manifest.webmanifest');

// ─── 5. Browserconfig.xml (Windows tile) ──────────────────────────────
const browserconfig = `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square150x150logo src="/favicon-192x192.png"/>
      <TileColor>#1F2A1B</TileColor>
    </tile>
  </msapplication>
</browserconfig>`;
fs.writeFileSync(path.join(publicDir, 'browserconfig.xml'), browserconfig);
console.log('✓ browserconfig.xml');

console.log('\n🎨 Tutti gli asset social/favicon generati in public/');

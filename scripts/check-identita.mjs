#!/usr/bin/env node
// Controllo di separazione dell'identità editoriale.
//
// Il sito è indipendente: alcuni nomi (persone e attività estranee al progetto)
// non devono mai comparire, né nelle pagine né nei file serviti né nel codice.
// Il repository è pubblico, quindi qui i nomi non sono scritti in chiaro: ci sono
// solo le loro impronte SHA-256. Lo script spezza ogni testo in parole minuscole
// senza accenti e confronta l'impronta di ogni gruppo di 1-3 parole, unito con o
// senza spazio (così prende anche le forme attaccate, come nei domini).
//
// Uso:  node scripts/check-identita.mjs [--warn] [percorso ...]
//       senza percorsi controlla dist/ e src/content/.
//       --warn segnala ma non fa fallire (usato nel build di Cloudflare);
//       senza --warn esce con codice 1 (usato dal workflow degli articoli).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const warnOnly = args.includes('--warn');
const targets = args.filter((a) => a !== '--warn');
const percorsi = targets.length ? targets : ['dist', 'src/content'];

// Impronte dei nomi vietati (forma con spazi e forma attaccata).
const NOMI = new Set([
  '21dda7961d1db06b84ec3bf0caaa96e0f23ea0f89ac8e0aa5a9c2c549dbc3575',
  'd6a81e4349dd0935d5352cb5994dd2052c45d67de9a667c11b26bda32ef05fa8',
  'fcbfaedff69abcf279da695fc31c4c1cc8cb45f5f834e0a04a355e22bac68b34',
  '87e06b6187e6a48e4f6cc9302c95886836c6ef8def28188ae58aa9ff71e14753',
  '5da6b85c4402343fd1d3d4f554a4b64e396634435f553825924c862e03be85b7',
  'c9d2612e7245cf725948f164b3d28b5470e0f9b9f6f9e9065aa42e6d6ac81591',
  'a91e94efa05e9c3fcf6dc9011dc05e0e3d3f0db8a849bea911fdea772c0273dd',
]);
// Impronte delle parole con cui quei nomi cominciano: servono solo a non
// calcolare impronte di gruppi che non possono essere un nome vietato.
const INIZI = new Set([
  '21dda7961d1db06b84ec3bf0caaa96e0f23ea0f89ac8e0aa5a9c2c549dbc3575',
  'dd8b20c25fa48b062f1d6ff4ac1e0b349cf3c77ffbee9c3f53cee94078454657',
  '87e06b6187e6a48e4f6cc9302c95886836c6ef8def28188ae58aa9ff71e14753',
  '5da6b85c4402343fd1d3d4f554a4b64e396634435f553825924c862e03be85b7',
  '2348f998744212575d85959674f9607ab26f67708a917157472832386337c904',
  'a91e94efa05e9c3fcf6dc9011dc05e0e3d3f0db8a849bea911fdea772c0273dd',
]);

const ESTENSIONI = /\.(html?|md|mdx|json|ya?ml|txt|xml|js|mjs|css|astro|ts|svg)$/i;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const cache = new Map();
const h = (s) => {
  let v = cache.get(s);
  if (!v) cache.set(s, (v = sha(s)));
  return v;
};

function parole(testo) {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function controlla(file) {
  const t = parole(fs.readFileSync(file, 'utf-8'));
  const trovati = [];
  for (let i = 0; i < t.length; i++) {
    if (!INIZI.has(h(t[i]))) continue;
    for (let n = 1; n <= 3 && i + n <= t.length; n++) {
      const g = t.slice(i, i + n);
      if (NOMI.has(h(g.join(' '))) || NOMI.has(h(g.join('')))) {
        trovati.push(i);
        break;
      }
    }
  }
  return trovati.length;
}

function cammina(p, acc) {
  if (!fs.existsSync(p)) return acc;
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) {
      if (e === 'node_modules' || e === '.git') continue;
      cammina(path.join(p, e), acc);
    }
  } else if (ESTENSIONI.test(p) && st.size < 5 * 1024 * 1024) acc.push(p);
  return acc;
}

const file = percorsi.flatMap((p) => cammina(path.resolve(root, p), []));
const problemi = [];
for (const f of file) {
  const n = controlla(f);
  if (n) problemi.push(`${path.relative(root, f)} (${n})`);
}

if (problemi.length) {
  console.error(`check-identita: nomi estranei al progetto in ${problemi.length} file:\n  ${problemi.join('\n  ')}`);
  process.exit(warnOnly ? 0 : 1);
}
console.log(`check-identita: ${file.length} file controllati, nessun nome estraneo al progetto.`);

#!/usr/bin/env node
// Keyword research automatica per case mobili usate.
// Source: Google Suggest + People Also Ask + analizziamo cosa già copriamo.
// Output: candidate keyword settimanale + suggerimento argomento.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

// Seed keyword (head terms del settore)
const SEED_KEYWORDS = [
  'case mobili usate',
  'casa mobile usata',
  'mobil home usato',
  'casette mobili usate',
  'casa mobile',
  'case mobili',
  'casa mobile residenza',
  'casa mobile prezzi',
  'casa mobile permessi',
  'casa mobile campeggio',
  'casa mobile terreno',
  'mobil home',
  'roulotte casa mobile',
  'casa mobile inverno',
  'casa mobile vivere',
  'comprare casa mobile',
  'vendere casa mobile usata',
  'casa mobile normativa',
];

// Modificatori query high-intent
const MODIFIERS = [
  'come', 'quando', 'dove', 'quanto', 'perché', 'quale',
  'migliore', 'opinioni', 'recensioni',
  'prezzi', 'costi', 'costo',
  'usate', 'usata', 'seconda mano',
  '2026', 'normativa', 'permessi',
  'vivere', 'abitare', 'residenza',
  'campeggio', 'terreno', 'agricolo',
  'piazzola', 'subentro',
  'truffa', 'truffe', 'errori', 'attenzione',
  'manutenzione', 'isolamento', 'inverno',
  'nuova', 'differenza',
];

// ─── Google Suggest API (gratis, no key) ─────────────────────────────
async function googleSuggest(query) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=it&gl=it&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data[1] || [];
  } catch (e) {
    return [];
  }
}

// ─── Articoli già pubblicati (per evitare duplicati) ─────────────────
function getPublishedSlugs() {
  const articoliDir = path.join(projectRoot, 'src/content/articoli');
  const slugs = new Set();
  if (fs.existsSync(articoliDir)) {
    for (const f of fs.readdirSync(articoliDir)) {
      if (f.endsWith('.mdx')) slugs.add(f.replace('.mdx', ''));
    }
  }
  return slugs;
}

function getPublishedKeywords() {
  const articoliDir = path.join(projectRoot, 'src/content/articoli');
  const keywords = new Set();
  if (fs.existsSync(articoliDir)) {
    for (const f of fs.readdirSync(articoliDir)) {
      if (!f.endsWith('.mdx')) continue;
      const content = fs.readFileSync(path.join(articoliDir, f), 'utf-8');
      const m = content.match(/^focusKeyword:\s*"([^"]+)"$/m);
      if (m) keywords.add(m[1].toLowerCase());
    }
  }
  return keywords;
}

// ─── Score di una keyword candidate ──────────────────────────────────
function scoreKeyword(kw, publishedKeywords) {
  let score = 0;
  // Long-tail (3+ parole) → meno competition, più intent
  const wordCount = kw.split(/\s+/).length;
  if (wordCount >= 3) score += 20;
  if (wordCount >= 4) score += 15;
  // Contiene modificatore high-intent
  if (/come|quanto|dove|quando|perché|quale|migliore|prezzi|costi|usate?|2026|normativa|permessi|vivere|residenza|campeggio|terreno|truffa|errori|attenzione|manutenzione|isolamento|inverno|nuova|differenza/i.test(kw)) score += 15;
  // Contiene "casa mobile" o "case mobili" o "mobil home" (rilevante)
  if (/casa\s+mobile|case\s+mobili|mobil[\s-]home|casette\s+mobili/i.test(kw)) score += 25;
  // Penalizza se già pubblicato
  for (const pub of publishedKeywords) {
    if (kw.includes(pub) || pub.includes(kw)) {
      score -= 50;
      break;
    }
  }
  return score;
}

// ─── Pipeline principale ─────────────────────────────────────────────
async function main() {
  console.log('🔍 Keyword research week ' + new Date().toISOString().slice(0, 10));
  console.log('');

  const published = getPublishedKeywords();
  console.log(`Articoli già pubblicati: ${published.size} keyword coperte\n`);

  // 1. Espandi seeds
  const candidates = new Map(); // kw → score
  console.log('📥 Fetching Google Suggest per ' + SEED_KEYWORDS.length + ' seeds...');

  for (const seed of SEED_KEYWORDS) {
    const suggestions = await googleSuggest(seed);
    for (const s of suggestions) {
      const score = scoreKeyword(s, published);
      if (score > 0) {
        if (!candidates.has(s) || candidates.get(s) < score) {
          candidates.set(s, score);
        }
      }
    }
    // Anche con modificatori
    for (const mod of MODIFIERS.slice(0, 5)) {
      const expandedSuggestions = await googleSuggest(`${seed} ${mod}`);
      for (const s of expandedSuggestions) {
        const score = scoreKeyword(s, published);
        if (score > 0) {
          if (!candidates.has(s) || candidates.get(s) < score) {
            candidates.set(s, score);
          }
        }
      }
    }
    process.stdout.write('.');
  }
  console.log('\n');

  // 2. Top 20 candidati
  const ranked = [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  console.log(`✅ Top 20 keyword candidati (out of ${candidates.size}):\n`);
  for (const [kw, score] of ranked) {
    console.log(`   [${score}]  ${kw}`);
  }

  // 3. Pick the best one (highest score, weekly rotation by date)
  // Usa la date come seed per varietà settimanale
  const weekSeed = new Date().getDay() + new Date().getDate();
  const pickIdx = weekSeed % Math.min(5, ranked.length);
  const [chosenKw, chosenScore] = ranked[pickIdx];

  console.log(`\n🎯 Keyword scelta della settimana: "${chosenKw}" (score ${chosenScore})`);

  // 4. Genera slug
  const slug = chosenKw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);

  // 5. Identifica pillar appropriato
  let pillar = 'guide-acquisto';
  if (/normativ|permess|residenz|legge|decreto|abuso|sentenz|agricol|terreno/i.test(chosenKw)) pillar = 'normativa';
  else if (/prezz|cost|valor|svalut|finanz|mutuo|argus/i.test(chosenKw)) pillar = 'prezzi';
  else if (/atlas|willerby|irm|burstner|adria|crippa|shelbox|sun roller|ohara|marche|model/i.test(chosenKw)) pillar = 'marche';
  else if (/trasport|consegn|piazzol|installa|preparazion/i.test(chosenKw)) pillar = 'trasporto';
  else if (/viver|abita|isolamen|invern|umidit|manuten|impiant|dehor|verand/i.test(chosenKw)) pillar = 'vivere';
  else if (/camping|campegg|agritur|dove\s+mettere/i.test(chosenKw)) pillar = 'dove-mettere';
  else if (/differenz|vs\b|confront|alternativ|tipologi/i.test(chosenKw)) pillar = 'tipologie';

  // 6. Output
  const result = {
    week: new Date().toISOString().slice(0, 10),
    chosenKeyword: chosenKw,
    score: chosenScore,
    slug,
    pillar,
    secondaryKeywords: ranked.slice(1, 8).map(([k]) => k),
    allCandidates: ranked.map(([k, s]) => ({ kw: k, score: s })),
  };

  const outFile = path.join(projectRoot, 'scripts/auto-publish/last-research.json');
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`\n💾 Salvato in scripts/auto-publish/last-research.json`);
  console.log(`📊 Pillar: ${pillar}`);
  console.log(`🔗 Slug: ${slug}`);

  return result;
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });

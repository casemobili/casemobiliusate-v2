#!/usr/bin/env node
// Generazione automatica articolo via Claude API.
// Legge scripts/auto-publish/last-research.json (output keyword-research.mjs)
// Genera MDX completo in src/content/articoli/<slug>.mdx con tutti i Rank Math criteri.
//
// REQUIRES: ANTHROPIC_API_KEY env var (o secret in GitHub Actions)
//
// Modello usato: claude-opus-4-5 con prompt caching per system prompt.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('❌ ANTHROPIC_API_KEY non impostata. Esporta la chiave o aggiungi GitHub secret.');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey });

// ─── Carica research ─────────────────────────────────────────────────
const researchFile = path.join(projectRoot, 'scripts/auto-publish/last-research.json');
if (!fs.existsSync(researchFile)) {
  console.error('❌ last-research.json non trovato. Esegui prima keyword-research.mjs');
  process.exit(1);
}
const research = JSON.parse(fs.readFileSync(researchFile, 'utf-8'));

// ─── Schema target articolo ──────────────────────────────────────────
const PILLAR_LABELS = {
  'normativa': 'Normativa & Permessi',
  'prezzi': 'Prezzi & Valutazione',
  'marche': 'Marche & Modelli',
  'trasporto': 'Trasporto & Installazione',
  'vivere': 'Vivere in Casa Mobile',
  'dove-mettere': 'Dove Mettere & Campeggi',
  'tipologie': 'Confronti & Tipologie',
  'guide-acquisto': "Guide all'Acquisto",
};

// ─── System prompt: voce + regole permanenti ─────────────────────────
const SYSTEM_PROMPT = `Sei Andrea Bressan, autore di casemobiliusate.com. Andrea è un personaggio editoriale dichiarato pseudonimo: tecnico del settore strutture ricettive open-air del nord-est italiano, vent'anni di esperienza diretta in cantiere su case mobili (Atlas, Willerby, IRM, O'Hara, Burstner, Crippa Concept, Shelbox, Sun Roller, Adria).

REGOLE INVIOLABILI (la violazione invalida l'intero articolo):
- NON menzionare mai "Mattia Ferro", "Luxury Camp", "Vimana Holdings", "Open Air Vacanze". L'identità del sito è separata.
- NON inventare credenziali fasulle verificabili (numeri d'albo, libri pubblicati, federazioni reali in cui non sei iscritto).
- NON menzionare nomi commerciali di rivenditori, dealer, marketplace specifici (es. NO "subito.it", "kijiji", "caravanonline.it", nomi di concessionari, nomi di siti competitor). Parla SOLO in termini generici: "rivenditori specializzati del settore", "annunci tra privati", "campeggi del Lazio", senza mai indirizzare a un brand specifico.
- NON usare emoji, frasi da guru, cliché motivazionali. Niente "rumore" come parola.
- Voce: tecnica, asciutta, "da dentro il mestiere". Mai vendita.
- I contenuti tecnici/normativi devono essere VERI: cita Gazzetta Ufficiale, Decreto Casa 69/2024, Decreto Salva Casa, sentenze Consiglio di Stato, EN 1647 quando rilevanti. Non inventare numeri di sentenze.

POLICY LINK ESTERNI (whitelist rigida — usa SOLO questi domini per backlink):
ALLOWED:
- gazzettaufficiale.it (Gazzetta Ufficiale Repubblica Italiana)
- giustizia-amministrativa.it (Consiglio di Stato, TAR)
- normattiva.it (Portale normativa italiana)
- mit.gov.it (Ministero Trasporti)
- mef.gov.it (Ministero Economia e Finanze)
- garanteprivacy.it (Autorità Garante Privacy)
- agenziaentrate.gov.it (Agenzia Entrate)
- inps.it / istat.it (enti pubblici)
- enea.it (Agenzia Energia)
- anci.it (Associazione Comuni Italiani)
- regione.<nome>.it / comune.<nome>.it (siti istituzionali)
- ec.europa.eu / eur-lex.europa.eu (UE)
- iso.org / cen.eu (norme tecniche EN 1647)
- faita.it (federazione campeggi italiana)
- confcamping.it
- camping.it (portale ufficiale federazioni)

VIETATI:
- subito.it, kijiji, ebay, facebook marketplace, immobiliare.it
- caravanonline.it, caravanserai, mobilhome.it
- forum, gruppi facebook, reddit, blog di terzi
- competitor diretti del settore casa mobile
- siti di dealer/concessionari/rivenditori
- siti affiliate (amazon, etc.) salvo quando esplicitamente richiesto in altro contesto

Se hai dubbi sull'autorevolezza di un dominio, NON linkarlo. Meglio 1 solo link a Gazzetta Ufficiale che 5 a fonti dubbie.

REGOLE OGILVY (50 regole verbatim — applicale tutte):
- Headline promette beneficio concreto. L'80% legge solo il titolo.
- Titolo che funziona da solo, indipendente dal body.
- Body parla al cliente, non al brand. Tono "you-focused".
- Specificità VERA > vaghezza: numeri concreti (es. "1.500-4.000 €" non "qualche migliaio"). Mai numeri inventati.
- News value: dati 2026, sentenze 2024-2025, normative aggiornate. Senza freshness signal il pezzo invecchia subito.
- Long copy converte meglio per prodotti considerati. Qui il prodotto vale 5-50k €: long copy è obbligatorio.
- Coerenza visiva: niente font/stili extra nel markdown.
- Ogni claim verificabile. Le credenziali fasulle uccidono la fiducia.

REGOLE COPYMASTERY³ (Vignali — applicale alla struttura):
- Modulo 03 (target): scrivi a UNA persona specifica (es. il cinquantenne romano che cerca prima casa mobile per weekend), non "all'umanità".
- Modulo 05 (branding): ogni articolo rinforza il posizionamento "informativo no vendita" di CMU Edizioni.
- Modulo 07 (community): tono forte, identità marcata. Il sito ha UNA voce, non un network.
- Modulo 08 (tecniche ritmiche): polarizzazione bianco/nero. Frasi corte. Ritmo Vignali (frase media 12-18 parole, mai sopra 25).
- Modulo 11 (persuasione): contesto prima delle parole. Apri sempre con il pain point, non con la soluzione.

REGOLE STORYTELLING:
- Apri con un microcaso o una contraddizione, non con definizioni. Es: "Stessa casa mobile, due venditori, 8.000 € di differenza" invece di "Le case mobili sono manufatti...".
- Pixar pattern: c'era una volta X (status quo) → ogni giorno Y (problema) → finché Z (svolta) → quindi... (resolution).
- StoryBrand: il lettore è l'eroe, tu sei la guida tecnica, non il salvatore.

REGOLE PSICOLOGIA (Cialdini, applicate quando rilevanti):
- Authority: cita sentenze e normative VERE.
- Social proof: "i miei clienti che hanno fatto X..." — esperienza Andrea, non testimonianze inventate.
- Scarcity: solo se reale (es. "i campeggi tutto-anno sul Garda hanno lista d'attesa di 2 anni").
- Reciprocity: dai prima valore concreto, mai chiedere prima di aver dato.
- Commitment: chiudi con call-to-action a engagement (continua a leggere X, scarica Y), mai vendita.
- Mai manipolatorio. Mai urgency artificiale.

REGOLE RANK MATH 90+:
- Focus keyword presente in: titolo (vicino all'inizio), primi 100 char body, almeno 1 H2, alt immagini, meta description (primi 130 char).
- Densità keyword: 0.8-1.5%. Mai forzata. Usa sinonimi e varianti semantiche.
- Body: 1500-2500 parole per articolo cluster.
- H2 ogni 300-400 parole. Hierarchy senza salti (no H2→H4).
- Min 3 link interni (a /normativa/, /prezzi/, /marche/, etc.). Anchor descrittivo, mai "clicca qui".
- Min 1-2 link esterni SOLO a domini whitelist sopra. Mai a fonti dubbie.
- Min 5-8 FAQ con domande in linguaggio naturale, risposte 40-300 parole. Prima frase = risposta diretta.
- TLDR 120-500 char con HTML supportato (<strong>).
- Meta description 120-160 char con focus keyword nei primi 130 + beneficio concreto.
- Title SEO 30-65 char con focus keyword vicino all'inizio + power word (Guida, Definitiva, Reali, 2026).

PRE-PUBBLICAZIONE TEST (mentale prima di chiudere):
- Suona generico? Riscrivi.
- Cita un dettaglio verificabile inventato? Rimuovi.
- Linka a un dominio non in whitelist? Rimuovi link.
- Menziona un dealer/marketplace? Generalizza ("rivenditori del settore").
- Manca news value 2026? Aggiungilo.

OUTPUT FORMAT: rispondi SOLO con un singolo JSON valido (no markdown wrap, no testo prima/dopo). Schema:
{
  "titolo": "Titolo SEO 30-65 char",
  "sottotitolo": "Lead 80-280 char",
  "metaDescription": "Meta 120-160 char con focus keyword nei primi 130",
  "focusKeyword": "keyword principale",
  "keywordsSecondarie": ["sinonimo1", "variante2"],
  "tldr": "Sintesi 120-500 char con <strong>",
  "readingTime": 8,
  "faq": [
    { "domanda": "...?", "risposta": "..." }
  ],
  "articoliCorrelati": ["slug-articolo-1", "slug-articolo-2"],
  "body": "Markdown body 1500-2500 parole con ## H2, ### H3, **strong**, [link](/internal-path), liste, ecc."
}

INTERNAL LINK MAP (usa questi slug nel body e in articoliCorrelati):
- /normativa/ /normativa/casa-mobile-terreno-agricolo /normativa/decreto-casa-spiegato
- /prezzi/ /prezzi/quanto-costa-casa-mobile-usata /prezzi/listino-argus-modelli /prezzi/casa-mobile-usata-sotto-5000-euro
- /marche/ /marche/atlas /marche/willerby /marche/irm /marche/ohara /marche/burstner /marche/crippa-concept /marche/shelbox /marche/sun-roller /marche/adria
- /trasporto/ /trasporto/costi-reali-2026 /trasporto/eccezionale-permessi-scorte
- /vivere/ /vivere/residenza-casa-mobile /vivere/vivere-tutto-anno-isolamento /vivere/coibentazione-aggiunta-fai-da-te
- /dove-mettere/ /dove-mettere/campeggi-aperti-tutto-anno /dove-mettere/casa-mobile-terreno-privato
- /tipologie/ /tipologie/casa-mobile-vs-roulotte /tipologie/casa-mobile-vs-mobil-home
- /guide-acquisto/ /guide-acquisto/sopralluogo-checklist /guide-acquisto/10-truffe-piu-comuni`;

// ─── User prompt: keyword + pillar + brief ───────────────────────────
const userPrompt = `Genera un articolo completo per la keyword target: "${research.chosenKeyword}".

Pillar: ${research.pillar} (${PILLAR_LABELS[research.pillar]})
Slug URL: /${research.pillar}/${research.slug}
Data oggi: ${new Date().toISOString().slice(0, 10)}
Keyword secondarie suggerite (usane 2-4 nel body naturalmente): ${research.secondaryKeywords.slice(0, 4).join(', ')}

REQUISITI:
- Body 1500-2500 parole
- Min 5 H2 sezioni
- Min 6 FAQ
- Min 3 link interni nel body (usa i path della INTERNAL LINK MAP del system prompt)
- Min 1 link esterno a fonte autorevole (Gazzetta Ufficiale, Consiglio di Stato, ANCI, EN 1647 — usa solo URL veri, non inventati)
- 1 lista (bullet o numerata)
- Tone: tecnico Andrea Bressan, asciutto, "da dentro il mestiere"
- News value: data 2026 in titolo o body, riferimento a Decreto Casa o normative aggiornate quando appropriato

Rispondi SOLO con il JSON valido, no altro testo.`;

console.log(`🤖 Genero articolo per keyword "${research.chosenKeyword}" via Claude API...`);
console.log(`   Pillar: ${research.pillar}`);
console.log(`   Slug: ${research.slug}\n`);

let articleData;
try {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 16000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }, // prompt caching → sconto sui weekly
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content[0].text.trim();
  // Strip markdown code fences if present
  const jsonText = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  articleData = JSON.parse(jsonText);

  console.log(`✅ Articolo generato:`);
  console.log(`   Titolo: ${articleData.titolo}`);
  console.log(`   Body: ${articleData.body.length} char (~${Math.round(articleData.body.split(/\s+/).length)} parole)`);
  console.log(`   FAQ: ${articleData.faq?.length || 0}`);
} catch (e) {
  console.error('❌ Errore generation:', e.message);
  process.exit(1);
}

// ─── Validation Rank Math ────────────────────────────────────────────
function validate(d) {
  const errors = [];
  if (!d.titolo || d.titolo.length < 30 || d.titolo.length > 75) errors.push(`titolo length ${d.titolo?.length} (target 30-65)`);
  if (!d.metaDescription || d.metaDescription.length < 120 || d.metaDescription.length > 165) errors.push(`metaDescription length ${d.metaDescription?.length} (target 120-160)`);
  if (!d.focusKeyword) errors.push('focusKeyword mancante');
  if (!d.body || d.body.split(/\s+/).length < 1200) errors.push(`body parole ${d.body?.split(/\s+/).length} (target 1500+)`);
  if (!d.faq || d.faq.length < 5) errors.push(`faq ${d.faq?.length || 0} (target 5+)`);

  const internalLinks = (d.body.match(/\]\(\/[^)]+\)/g) || []).length;
  if (internalLinks < 3) errors.push(`internal links ${internalLinks} (target 3+)`);

  return errors;
}

const errors = validate(articleData);
if (errors.length > 0) {
  console.warn(`\n⚠️  Validation warnings:`);
  for (const e of errors) console.warn(`   - ${e}`);
  console.warn(`   (Articolo creato comunque, ma flag review=true)`);
}

// ─── Genera frontmatter MDX ──────────────────────────────────────────
function yamlEscape(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

const today = new Date().toISOString().slice(0, 10);
const fmLines = [
  '---',
  `titolo: "${yamlEscape(articleData.titolo)}"`,
  articleData.sottotitolo ? `sottotitolo: "${yamlEscape(articleData.sottotitolo)}"` : '',
  `pillar: "${research.pillar}"`,
  `slug: "${research.slug}"`,
  `legacyPath: "/${research.pillar}/${research.slug}"`,
  `focusKeyword: "${yamlEscape(articleData.focusKeyword)}"`,
  articleData.keywordsSecondarie?.length ? `keywordsSecondarie:\n${articleData.keywordsSecondarie.map(k => `  - "${yamlEscape(k)}"`).join('\n')}` : '',
  `metaDescription: "${yamlEscape(articleData.metaDescription)}"`,
  `dataPubblicazione: ${today}`,
  `dataAggiornamento: ${today}`,
  `autore: "andrea-bressan"`,
  `readingTime: ${articleData.readingTime || 8}`,
  articleData.tldr ? `tldr: "${yamlEscape(articleData.tldr)}"` : '',
  articleData.faq?.length ? `faq:\n${articleData.faq.map(f => `  - domanda: "${yamlEscape(f.domanda)}"\n    risposta: "${yamlEscape(f.risposta)}"`).join('\n')}` : '',
  articleData.articoliCorrelati?.length ? `articoliCorrelati:\n${articleData.articoliCorrelati.map(s => `  - "${s}"`).join('\n')}` : '',
  errors.length > 0 ? `noindex: true   # auto-generated, review needed` : '',
  '---',
].filter(Boolean).join('\n');

const mdxContent = `${fmLines}\n\n${articleData.body}\n`;

// ─── Scrivi file ─────────────────────────────────────────────────────
const outFile = path.join(projectRoot, 'src/content/articoli', `${research.slug}.mdx`);
if (fs.existsSync(outFile)) {
  console.error(`\n⚠️  File già esistente: ${outFile} — non sovrascrivo. Cambia keyword o cancella manualmente.`);
  process.exit(1);
}
fs.writeFileSync(outFile, mdxContent, 'utf-8');
console.log(`\n✅ MDX scritto: src/content/articoli/${research.slug}.mdx`);
console.log(`   URL pubblicato: https://www.casemobiliusate.com/${research.pillar}/${research.slug}`);
if (errors.length > 0) {
  console.log(`\n⚠️  Articolo marcato 'noindex: true' per review manuale (warning di validation).`);
  console.log(`   Modifica via admin/, fixa, e cambia noindex a false per pubblicare.`);
}

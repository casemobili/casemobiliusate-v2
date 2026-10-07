#!/usr/bin/env node
// Pagina di statistiche mensile (decisione del 7 ottobre 2026).
//
// Segue il metodo dei linkable asset (Risorse/seo/2026-10-06-linksthatrank-…):
// una raccolta di dati verificati su un tema, titoli in forma di domanda con la
// risposta subito sotto, tabelle, immagine con i numeri, schema Article + Dataset,
// link interni dagli articoli collegati, licenza CC BY 4.0 (la mette il layout).
//
// Il punto non negoziabile è la verifica: nessun numero esce senza fonte.
//   1. RICERCA   Claude con ricerca web raccoglie i dati, ognuno con URL e frase.
//   2. VERIFICA  lo script scarica ogni fonte da sé; un secondo passaggio di
//                Claude, ostile e con il documento davanti, deve ritrovare la
//                frase esatta. Per le pagine di testo lo script controlla anche
//                che la frase ci sia davvero e contenga il numero.
//   3. SCRITTURA Claude scrive la pagina usando SOLO i dati sopravvissuti.
//   4. CONTROLLO ogni numero del testo deve corrispondere a un dato verificato;
//                se no, una correzione, poi rinuncia.
// Se i dati verificati sono troppo pochi o il controllo fallisce, lo script esce
// con codice 3 senza scrivere nulla: il workflow ripiega sull'articolo normale e
// la pagina di statistiche ci riprova all'uscita successiva.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const articoliDir = path.join(projectRoot, 'src/content/articoli');
const imagesDir = path.join(projectRoot, 'public/images');
const reportFile = path.join(__dirname, 'last-stats-report.json');

const MODEL = process.env.STATS_MODEL || 'claude-opus-4-5';
const MIN_DATI = 15;
const MIN_FONTI = 3;
const DRY_RUN = process.env.DRY_RUN === '1';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY non impostata.');
  process.exit(1);
}
const anthropic = new Anthropic({ apiKey });

const report = { data: new Date().toISOString(), modello: MODEL, esito: 'in corso', scartati: [] };
function rinuncia(motivo) {
  report.esito = `rinuncia: ${motivo}`;
  try {
    if (pagina) report.ultimaPagina = pagina; // per capire, dopo, che cosa non andava
  } catch {
    /* rinuncia prima della scrittura: non c'è ancora una pagina */
  }
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.error(`\nRinuncio alla pagina di statistiche: ${motivo}`);
  process.exit(3);
}

// ─── Tema ────────────────────────────────────────────────────────────
const temi = JSON.parse(fs.readFileSync(path.join(__dirname, 'stats-themes.json'), 'utf-8')).temi;
const tema = temi.find((t) => !fs.existsSync(path.join(articoliDir, `${t.slug}.mdx`)));
if (!tema) rinuncia('nessun tema libero');
report.tema = tema.slug;
const pageUrl = `/${tema.pillar}/${tema.slug}`;
console.log(`Tema: ${tema.slug}\n  ${tema.tema}\n`);

// ─── Domini ammessi nei link visibili (Regola 0bis del progetto) ─────
const WHITELIST = [
  /(^|\.)gazzettaufficiale\.it$/, /(^|\.)normattiva\.it$/, /(^|\.)giustizia-amministrativa\.it$/,
  /(^|\.)mit\.gov\.it$/, /(^|\.)mef\.gov\.it$/, /(^|\.)agenziaentrate\.gov\.it$/, /(^|\.)garanteprivacy\.it$/,
  /(^|\.)enea\.it$/, /(^|\.)anci\.it$/, /^(www\.)?regione\.[a-z-]+\.it$/, /^(www\.)?comune\.[a-z-]+\.[a-z]{2}\.it$/,
  /^(www\.)?comune\.[a-z-]+\.it$/, /(^|\.)ec\.europa\.eu$/, /(^|\.)eur-lex\.europa\.eu$/, /(^|\.)iso\.org$/,
  /(^|\.)cen\.eu$/, /(^|\.)faita\.it$/, /(^|\.)confcamping\.it$/, /(^|\.)camping\.it$/,
];
function inWhitelist(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return WHITELIST.some((re) => re.test(host));
  } catch {
    return false;
  }
}

// ─── Numeri: estrazione e confronto ──────────────────────────────────
// Le fonti scrivono 2.751 (italiano), 2,751 (inglese), 2 751 (Eurostat).
// Ogni gettone numerico produce i valori possibili nelle due convenzioni.
function compattaMigliaia(s) {
  return s.replace(/(\d)[\s   ](?=\d{3}(?!\d))/g, '$1');
}
function valori(tok) {
  const out = new Set();
  const it = tok.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const en = tok.replace(/,(?=\d{3}(\D|$))/g, '');
  for (const v of [it, en]) {
    const n = Number(v);
    if (Number.isFinite(n)) out.add(n);
  }
  return [...out];
}
function numeriIn(testo) {
  const t = compattaMigliaia(String(testo || ''));
  const out = [];
  const re = /\d+(?:[.,]\d+)*/g;
  let m;
  while ((m = re.exec(t))) {
    const dopo = t.slice(m.index + m[0].length, m.index + m[0].length + 14).toLowerCase();
    let scala = 1;
    if (/^\s*(mila)\b/.test(dopo)) scala = 1e3;
    else if (/^\s*(milion[ei]|mln)\b/.test(dopo)) scala = 1e6;
    else if (/^\s*(miliard[oi]|mld)\b/.test(dopo)) scala = 1e9;
    out.push({ tok: m[0], vals: valori(m[0]).map((v) => v * scala), dopo, index: m.index });
  }
  return out;
}
function vicino(a, b, tolleranza) {
  if (a === b) return true;
  if (b === 0) return false;
  return Math.abs(a - b) / Math.abs(b) <= tolleranza;
}

// ─── Fonti: download diretto ─────────────────────────────────────────
function htmlInTesto(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|p|div|tr|li|h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&agrave;/g, 'à').replace(/&egrave;/g, 'è').replace(/&eacute;/g, 'é')
    .replace(/&igrave;/g, 'ì').replace(/&ograve;/g, 'ò').replace(/&ugrave;/g, 'ù')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n');
}

async function scarica(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; casemobiliusate-verifica-fonti/1.0)', accept: '*/*' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const tipo = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (tipo.includes('pdf') || buf.subarray(0, 5).toString() === '%PDF-') {
      if (buf.length > 20 * 1024 * 1024) return null;
      return { tipo: 'pdf', base64: buf.toString('base64') };
    }
    const testo = htmlInTesto(buf.toString('utf-8'));
    return testo.trim().length > 200 ? { tipo: 'testo', testo } : null;
  } catch {
    return null;
  }
}

function jsonDa(testo) {
  const a = testo.indexOf('{');
  const b = testo.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('nessun JSON nella risposta');
  return JSON.parse(testo.slice(a, b + 1));
}
function testoFinale(content) {
  return content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

// ─── 1. RICERCA ──────────────────────────────────────────────────────
// Due fasi, per non riempire la memoria del modello (la prima versione, che
// apriva tutte le fonti in una richiesta sola, superava i 200.000 token):
//   a) la ricerca web trova i documenti, senza aprirli;
//   b) ogni documento si apre da solo, se ne estraggono i dati e li si verifica.
const CERCA_DOCUMENTI = `Sei un ricercatore di dati statistici per casemobiliusate.com, sito informativo italiano sulle case mobili e sul turismo all'aria aperta.

Tema della pagina: ${tema.tema}
Fonti da preferire: ${tema.fontiSuggerite}

Compito: con la ricerca web trova da 8 a 14 DOCUMENTI che contengono dati statistici su questo tema. Non estrarre ancora i dati: serve l'elenco dei documenti.

Regole:
- Solo fonti primarie o istituzionali: istituti di statistica (ISTAT, Eurostat, uffici statistici regionali), enti pubblici, federazioni di settore. Niente blog, giornali, siti di rivenditori, portali di annunci, aggregatori. Se un giornale cita un dato, cerca il documento dell'ente.
- I documenti più recenti disponibili.
- L'url deve essere quello esatto del documento (la pagina del comunicato, il PDF, la pagina "Statistics Explained"), non la home del sito.
- Preferisci comunicati, report e PDF. Evita le tabelle interattive che si caricano con JavaScript (per esempio il "databrowser" di Eurostat): non si possono leggere. Per Eurostat preferisci le pagine "Statistics Explained" e i comunicati.
- Mai siti di rivenditori, concessionari o portali di annunci.

Rispondi SOLO con un JSON valido:
{"documenti":[{"url":"https://...","ente":"ISTAT","titolo":"titolo del documento","anno":"2025","contiene":"quali dati utili al tema contiene, in una riga"}]}`;

async function conPausa(params) {
  const messages = [...params.messages];
  let r;
  for (let giro = 0; giro < 6; giro++) {
    r = await anthropic.beta.messages.create({ ...params, messages });
    if (r.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: r.content });
  }
  return r;
}

console.log('1/5 Ricerca dei documenti (ricerca web)...');
let documenti;
try {
  const r = await conPausa({
    model: MODEL,
    max_tokens: 8000,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 }],
    messages: [{ role: 'user', content: CERCA_DOCUMENTI }],
  });
  documenti = (jsonDa(testoFinale(r.content)).documenti || []).filter((d) => /^https?:\/\//.test(d?.url || ''));
} catch (e) {
  rinuncia(`ricerca dei documenti fallita (${e.message.slice(0, 200)})`);
}
// Doppioni di URL fuori.
documenti = documenti.filter((d, i, a) => a.findIndex((x) => x.url === d.url) === i).slice(0, 14);
console.log(`  ${documenti.length} documenti trovati`);
report.documenti = documenti.map((d) => ({ url: d.url, ente: d.ente, titolo: d.titolo }));

// Se il nostro download fallisce (blocco, pagina vuota), apriamo il documento
// con lo strumento di lettura di Anthropic e ne teniamo il testo.
async function apriConStrumento(url) {
  try {
    const r = await conPausa({
      model: MODEL,
      max_tokens: 1000,
      betas: ['web-fetch-2025-09-10'],
      tools: [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 1, max_content_tokens: 80000 }],
      messages: [{ role: 'user', content: `Apri con lo strumento web_fetch questo indirizzo, poi rispondi soltanto FATTO.\n${url}` }],
    });
    for (const b of r.content) {
      if (b.type === 'web_fetch_tool_result' && b.content?.type === 'web_fetch_result') {
        const src = b.content.content?.source;
        if (src?.type === 'text' && src.data?.trim().length > 200) return { tipo: 'testo', testo: src.data };
        if (src?.type === 'base64' && /pdf/.test(src.media_type || '')) return { tipo: 'pdf', base64: src.data };
      }
    }
  } catch {
    /* il documento resta non leggibile */
  }
  return null;
}

const ESTRAI = (doc) => `Questo è il documento ${doc.url} (${doc.ente}, ${doc.titolo}).

Tema della pagina che stiamo preparando: ${tema.tema}

Estrai da QUESTO documento da 3 a 12 dati statistici utili al tema. Solo ciò che il documento dice: nessuna stima tua, nessun calcolo, niente dati ricordati.
- "valore" scritto ESATTAMENTE come nel documento (stesse cifre, stessi decimali).
- "frase" è la frase o la riga di tabella che contiene il numero, copiata alla lettera nella lingua originale.
- "anno" è l'anno a cui si riferisce il dato, non quello di pubblicazione.
- Se il dato è una stima o un campione, dillo in "dato".
Se il documento non contiene dati utili, restituisci una lista vuota.

Rispondi SOLO con un JSON valido:
{"dati":[{"sottotema":"...","dato":"descrizione in italiano di cosa misura il numero","valore":"2.751","unita":"strutture","anno":"2024","area":"Italia","frase":"..."}]}`;

// ─── 2. ESTRAZIONE E VERIFICA, DOCUMENTO PER DOCUMENTO ───────────────
console.log('2/5 Estrazione e verifica ostile, documento per documento...');
const norm = (s) => compattaMigliaia(String(s || '')).toLowerCase().replace(/\s+/g, ' ').trim();
const verificati = [];
report.candidati = 0;
report.documentiIllegibili = [];

for (const [i, info] of documenti.entries()) {
  const url = info.url;
  const doc = (await scarica(url)) || (await apriConStrumento(url));
  if (!doc) {
    report.documentiIllegibili.push({ url, motivo: 'non scaricabile' });
    continue;
  }
  const documento =
    doc.tipo === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: doc.base64 } }
      : { type: 'document', source: { type: 'text', media_type: 'text/plain', data: doc.testo.slice(0, 350000) } };

  let dati;
  try {
    const r = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 6000,
      messages: [{ role: 'user', content: [documento, { type: 'text', text: ESTRAI(info) }] }],
    });
    dati = (jsonDa(testoFinale(r.content)).dati || [])
      .filter((d) => d?.valore)
      .map((d, k) => ({ ...d, id: `d${i + 1}_${k + 1}`, url, ente: info.ente, documento: info.titolo }));
  } catch (e) {
    report.documentiIllegibili.push({ url, motivo: `estrazione non riuscita (${e.message.slice(0, 120)})` });
    continue;
  }
  report.candidati += dati.length;
  console.log(`  ${info.ente}: ${dati.length} dati estratti`);
  if (dati.length === 0) continue;

  const elenco = dati
    .map((d) => `- ${d.id}: "${d.dato}" = ${d.valore} ${d.unita || ''} (anno ${d.anno}, area ${d.area || 'n.d.'})`)
    .join('\n');

  let esiti;
  try {
    const r = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 6000,
      messages: [
        {
          role: 'user',
          content: [
            documento,
            {
              type: 'text',
              text: `Sei un verificatore ostile. Il tuo compito è trovare errori, non confermare.

Qui sopra c'è il documento ${url}. Per ognuna di queste affermazioni cerca nel documento il passaggio che la sostiene:
${elenco}

Un'affermazione è confermata SOLO se il documento riporta esattamente quel numero. Poi controlla la DESCRIZIONE con la stessa severità, leggendo intestazioni di tabella, titoli dei grafici, note e righe di totale:
- unità: notti/presenze oppure persone/arrivi oppure strutture, posti letto, euro;
- denominatore: quota di cosa su cosa (una riga "Totale" è il totale di tutti, non di un sottogruppo; quota A dentro B non è quota B dentro A);
- area e periodo: anno intero oppure stagione o trimestre, Italia oppure una regione;
- tipo di struttura e se è una stima o un campione.
Se il numero c'è ma la descrizione è imprecisa, conferma e scrivi in "descrizione_corretta" la descrizione esatta, in italiano, con unità, denominatore, area e periodo. Se il numero misura tutt'altra cosa o non c'è, NON confermare.

Rispondi SOLO con un JSON valido:
{"esiti":[{"id":"d1","confermato":true,"frase_esatta":"frase o riga di tabella copiata alla lettera dal documento, che contiene il numero","pagina":"numero di pagina se è un PDF","descrizione_corretta":"descrizione esatta, oppure stringa vuota se quella data è già esatta","motivo":"perché sì o perché no, in breve"}]}`,
            },
          ],
        },
      ],
    });
    esiti = jsonDa(testoFinale(r.content)).esiti || [];
  } catch (e) {
    for (const d of dati) report.scartati.push({ id: d.id, valore: d.valore, url, motivo: `verifica non eseguita (${e.message.slice(0, 120)})` });
    continue;
  }

  const testoDoc = doc.tipo === 'testo' ? norm(doc.testo) : null;
  const numeriDoc = doc.tipo === 'testo' ? numeriIn(doc.testo).flatMap((n) => n.vals) : null;
  for (const d of dati) {
    const e = esiti.find((x) => x.id === d.id);
    if (!e?.confermato) {
      report.scartati.push({ id: d.id, valore: d.valore, url, motivo: e?.motivo || 'non confermato' });
      continue;
    }
    // Il numero dichiarato deve stare nella frase trovata dal verificatore.
    const numFrase = numeriIn(e.frase_esatta).flatMap((n) => n.vals);
    const numValore = numeriIn(d.valore).flatMap((n) => n.vals);
    const numeroNellaFrase = numValore.length > 0 && numValore.some((v) => numFrase.some((f) => vicino(f, v, 1e-9)));
    if (!numeroNellaFrase) {
      report.scartati.push({ id: d.id, valore: d.valore, url, motivo: 'il numero non compare nella frase citata' });
      continue;
    }
    // Per le pagine di testo, la frase deve esistere davvero nel documento; per le
    // righe di tabella (dove l'impaginazione cambia gli spazi) basta che il numero
    // ci sia, insieme alla conferma del verificatore.
    if (testoDoc) {
      const f = norm(e.frase_esatta);
      const pezzo = f.length > 80 ? f.slice(0, 80) : f;
      const numeroNelDoc = numValore.some((v) => numeriDoc.some((x) => vicino(x, v, 1e-9)));
      if (!testoDoc.includes(pezzo) && !numeroNelDoc) {
        report.scartati.push({ id: d.id, valore: d.valore, url, motivo: 'né la frase né il numero si trovano nel testo della fonte' });
        continue;
      }
    }
    // La descrizione corretta dal verificatore sostituisce quella dell'estrazione:
    // nella prova del 7 ottobre gli errori di significato nascevano quasi tutti
    // da descrizioni imprecise (un totale descritto come «italiani», arrivi come presenze).
    const corretta = String(e.descrizione_corretta || '').trim();
    if (corretta) report.descrizioniCorrette = (report.descrizioniCorrette || 0) + 1;
    verificati.push({ ...d, dato: corretta || d.dato, frase: e.frase_esatta, pagina: e.pagina || '' });
  }
}

const fonti = [...new Set(verificati.map((d) => d.url))];
console.log(`  ${verificati.length} dati verificati da ${fonti.length} documenti, ${report.scartati.length} scartati`);
report.verificati = verificati;
if (verificati.length < MIN_DATI) rinuncia(`solo ${verificati.length} dati verificati (minimo ${MIN_DATI})`);
if (fonti.length < MIN_FONTI) rinuncia(`solo ${fonti.length} fonti verificate (minimo ${MIN_FONTI})`);

// ─── 3. SCRITTURA ────────────────────────────────────────────────────
const articoliEsistenti = fs
  .readdirSync(articoliDir)
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => {
    const fm = fs.readFileSync(path.join(articoliDir, f), 'utf-8').split(/\n---\n/)[0];
    const pillar = (fm.match(/^pillar:\s*"?([^"\n]+)"?/m) || [])[1];
    const slug = (fm.match(/^slug:\s*"?([^"\n]+)"?/m) || [])[1];
    const titolo = (fm.match(/^titolo:\s*"(.+)"/m) || [])[1] || '';
    const noindex = /^noindex:\s*true/m.test(fm);
    return pillar && slug && !noindex ? { path: `/${pillar}/${slug}`, titolo, file: f } : null;
  })
  .filter(Boolean);

const mese = new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
const urlAmmessiPrompt = new Set(fonti.filter(inWhitelist));
const datiPerPrompt = verificati
  .map((d) => `${d.id} | ${d.sottotema} | ${d.dato} | ${d.valore} ${d.unita || ''} | anno ${d.anno} | ${d.area || ''} | ${d.ente}, ${d.documento}`)
  .join('\n');

const SCRITTURA = `Sei Andrea Bressan, curatore di casemobiliusate.com (pseudonimo dichiarato; publisher CMU Edizioni). Voce tecnica, asciutta, da dentro il mestiere. Mai vendita, mai emoji, mai cliché, mai la parola "rumore". Mai nomi di rivenditori, concessionari o portali di annunci.

Scrivi una pagina di statistiche sul tema: ${tema.tema}
Focus keyword: "${tema.focusKeyword}". URL: ${pageUrl}. Data: ${mese}.

QUESTI SONO GLI UNICI NUMERI CHE PUOI USARE (già verificati sulla fonte originale):
id | sottotema | cosa misura | valore | anno | area | fonte
${datiPerPrompt}

REGOLA SUL SIGNIFICATO: ogni frase o riporta un dato dell'elenco con il suo significato esatto (cosa misura, su quale totale, area, anno, tipo di struttura, come dice la colonna "cosa misura"), o spiega come leggere i dati. Niente osservazioni tue, niente esperienza, niente spiegazioni di causa, niente confronti o conclusioni che i dati non contengono. Un dato regionale resta regionale, un dato su tutte le strutture non diventa un dato sui campeggi, un dato di stagione resta di stagione, notti e presenze non diventano persone («il 29% delle notti dei tedeschi», mai «il 29% dei tedeschi»). Niente classifiche, posizioni, «seguono», «primo», «la classifica prosegue»: l'elenco dei dati può essere incompleto; scrivi «tra i paesi riportati» o elenca i valori senza dire chi viene dopo chi. Ogni numero nell'immagine e nel suo testo alternativo porta area e anno.

REGOLA ASSOLUTA SUI NUMERI: ogni numero che scrivi (nel titolo, nel testo, nelle tabelle, nelle FAQ, nell'immagine) deve essere uno dei valori qui sopra, o lo stesso valore arrotondato (es. 1.316.795 → 1,3 milioni). Niente calcoli tuoi: niente somme, differenze, percentuali o rapporti ricavati. Niente numeri di leggi, sentenze o commi. Niente numeri ricordati. Se un passaggio richiederebbe un numero che non c'è, scrivilo senza numero. Gli anni vanno bene.

STRUTTURA (metodo delle pagine di statistiche che si prendono i link):
- Apertura di 2-3 frasi: a cosa serve la pagina e una regola di lettura (le fonti misurano cose diverse, non si sommano).
- 6-10 sezioni "## " una per sottotema, con il titolo in forma di DOMANDA che finisce con "?".
- Sotto ogni titolo, le prime due frasi rispondono con il dato principale, in **grassetto**, e citano ente e anno. Poi contesto breve.
- Almeno 2 tabelle Markdown (confronti tra anni, paesi, regioni o voci).
- Se due fonti danno numeri diversi per la stessa cosa, dillo e spiega che usano perimetri diversi.
- Penultima sezione "## Come citare questa pagina": il formato di citazione in corsivo con titolo, casemobiliusate.com, "aggiornato ${mese}"; poi la frase "Per i numeri più importanti conviene citare anche la fonte primaria indicata accanto a ciascuno. Dati, tabelle e immagine in apertura si possono riusare alle condizioni della licenza indicata in fondo alla pagina."
- Ultima sezione "## Le fonti di questa pagina": elenco puntato per ente, con i titoli dei documenti. Link esterni SOLO a questi indirizzi, copiati identici (gli altri documenti senza link):
${[...urlAmmessiPrompt].join('\n') || '(nessuno: tutte le fonti senza link)'}
- Chiudi con: "Aggiorniamo questa pagina una volta l'anno, quando escono i nuovi dati."
- Almeno 3 link interni con anchor descrittivo, scelti SOLO da questo elenco (senza slash finale):
${articoliEsistenti.map((a) => `${a.path} — ${a.titolo}`).join('\n')}
- La focus keyword va scritta in italiano corretto, con articoli e preposizioni («turisti stranieri nei campeggi in Italia»), mai incollata così com'è se suona sgrammaticata; lo stesso per il titolo, il tldr e la meta description.
- Commento ridotto al minimo: dopo il dato, al massimo una frase su come leggerlo (cosa misura, con quale altro dato non va confuso). Niente frasi su cosa significa per chi compra, vende o gestisce, niente tendenze dedotte. Paragrafi di 2-4 righe, frasi sotto le 25 parole. Corpo 900-1.800 parole: le tabelle contano.

Rispondi SOLO con un JSON valido:
{
  "titolo": "30-70 caratteri, con la keyword e l'anno",
  "sottotitolo": "80-280 caratteri",
  "metaDescription": "120-160 caratteri, keyword nei primi 130, con 2-3 numeri chiave",
  "focusKeyword": "${tema.focusKeyword}",
  "keywordsSecondarie": ["4-6 varianti"],
  "tldr": "150-500 caratteri, i 3-4 numeri chiave in <strong>",
  "readingTime": 9,
  "faq": [{"domanda":"...?","risposta":"40-120 parole, prima frase = risposta con il dato e la fonte"}],
  "articoliCorrelati": ["pillar/slug", "pillar/slug", "pillar/slug"],
  "dataset": {"nome":"nome della raccolta di dati","descrizione":"cosa contiene, con enti e anni","copertura":"AAAA/AAAA","area":"Italia o Europa","parole":["5-7 parole chiave"]},
  "immagine": {"occhiello":"MAIUSCOLO, max 45 caratteri","titolo":"max 40 caratteri","voci":[{"grande":"max 9 caratteri, es. 2.751 o 14,7%","testo":"max 55 caratteri","fonte":"Ente, anno"}]},
  "altImmagine": "descrizione dell'immagine con i numeri",
  "linkDa": [{"path":"/pillar/slug di un articolo dell'elenco che deve linkare a questa pagina","anchor":"anchor descrittivo, 3-8 parole, senza numeri"}],
  "body": "Markdown"
}
Le FAQ sono 8-10. "immagine.voci" sono esattamente 6. "linkDa" sono 3.`;

console.log('3/5 Scrittura della pagina...');
// Niente conoscenze-seo-geo.md qui: la pagina di statistiche segue il proprio metodo
// (linkable asset) e la regola sui numeri, con cui varie regole generali entrano in
// conflitto (stime, esempi di calcolo, estremi di norme).
async function chiedi(messages) {
  const r = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    messages,
  });
  return { testo: testoFinale(r.content), content: r.content };
}

const conversazione = [{ role: 'user', content: SCRITTURA }];
let pagina;
try {
  const r = await chiedi(conversazione);
  conversazione.push({ role: 'assistant', content: r.content });
  pagina = jsonDa(r.testo);
} catch (e) {
  rinuncia(`scrittura fallita (${e.message})`);
}

// ─── 4. CONTROLLO DEI NUMERI E DELLA STRUTTURA ───────────────────────
// Solo il valore verificato e il suo anno: gli altri numeri della stessa riga di
// tabella non sono stati verificati uno per uno.
// Numeri ammessi: valore e anno di ogni dato verificato (esclusi = riserva per
// togliere un dato intero, oggi non usata).
const esclusi = new Set();
let ammessi = [];
function aggiornaAmmessi() {
  ammessi = verificati
    .filter((d) => !esclusi.has(d.id))
    .flatMap((d) => [d.valore, d.anno].flatMap((t) => numeriIn(t).flatMap((n) => n.vals)));
}
aggiornaAmmessi();

function testiDaControllare(p) {
  const corpo = String(p.body || '')
    .replace(/\]\([^)]*\)/g, ']') // URL dei link
    .replace(/^\|?[\s:|-]+\|?$/gm, ''); // righe di separazione delle tabelle
  return [
    ['titolo', p.titolo], ['sottotitolo', p.sottotitolo], ['metaDescription', p.metaDescription],
    ['tldr', p.tldr], ['altImmagine', p.altImmagine], ['corpo', corpo],
    ...(p.faq || []).map((f, i) => [`faq ${i + 1}`, `${f.domanda} ${f.risposta}`]),
    ...(p.immagine?.voci || []).map((v, i) => [`immagine ${i + 1}`, `${v.grande} ${v.testo} ${v.fonte}`]),
    ...(p.linkDa || []).map((l, i) => [`anchor ${i + 1}`, l.anchor]),
  ];
}

function numeriNonVerificati(p) {
  const problemi = [];
  for (const [dove, testo] of testiDaControllare(p)) {
    for (const n of numeriIn(testo)) {
      const v = n.vals[0];
      if (n.vals.every((x) => x >= 1990 && x <= 2035 && Number.isInteger(x))) continue; // anni
      const piccolo = n.vals.every((x) => Number.isInteger(x) && x <= 12) && !/^\s*(%|per cento|€|euro)/.test(n.dopo);
      if (piccolo) continue; // conteggi minimi ("tre fonti", "4 regioni")
      const ok = n.vals.some((x) => ammessi.some((a) => vicino(x, a, 0.025)));
      if (!ok) {
        const t = String(testo);
        problemi.push({ dove, numero: n.tok, contesto: t.slice(Math.max(0, n.index - 60), n.index + 60).replace(/\s+/g, ' ') });
      }
    }
  }
  return problemi;
}

function problemiStruttura(p) {
  const e = [];
  const body = String(p.body || '');
  const h2 = body.match(/^## .+$/gm) || [];
  if (h2.filter((h) => h.trim().endsWith('?')).length < 6) e.push('meno di 6 titoli in forma di domanda');
  if ((body.match(/^\|?\s*:?-{3,}/gm) || []).length < 2) e.push('meno di 2 tabelle');
  if (!/^## Come citare questa pagina/m.test(body)) e.push('manca la sezione "Come citare questa pagina"');
  if (!/^## Le fonti di questa pagina/m.test(body)) e.push('manca la sezione "Le fonti di questa pagina"');
  const interni = (body.match(/\]\(\/[^)]+\)/g) || []).length;
  if (interni < 3) e.push(`solo ${interni} link interni`);
  if (body.split(/\s+/).length < 700) e.push('corpo sotto le 700 parole');
  if (!p.faq || p.faq.length < 6) e.push('meno di 6 FAQ');
  if (!p.dataset?.nome || !p.dataset?.descrizione || !p.dataset?.copertura) e.push('campo dataset incompleto');
  if (!p.immagine?.voci || p.immagine.voci.length < 4) e.push('immagine con meno di 4 voci');
  if (!p.titolo || p.titolo.length > 75) e.push('titolo assente o oltre 75 caratteri');
  if (!p.metaDescription || p.metaDescription.length < 110 || p.metaDescription.length > 165) e.push('meta description fuori misura');
  if (/rumore/i.test(body)) e.push('contiene la parola "rumore"');
  return e;
}

// Link esterni: solo gli indirizzi ESATTI dei documenti verificati, e solo se di
// dominio ammesso. Nella prova del 7 ottobre il modello aveva cambiato due URL
// di Eurostat: un dominio giusto non basta. Gli altri link si tolgono, il testo resta.
const urlAmmessi = new Set(fonti.filter(inWhitelist).map((u) => u.replace(/\/$/, '')));
function pulisciLinkEsterni(p) {
  p.body = String(p.body || '').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, testo, url) =>
    urlAmmessi.has(url.replace(/\/$/, '')) ? m : testo
  );
  // Link interni: solo verso pagine esistenti, senza slash finale.
  const validi = new Set(articoliEsistenti.map((a) => a.path));
  p.body = p.body.replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, (m, testo, u) => {
    const pulito = u.replace(/\/$/, '');
    const pillarOnly = /^\/[a-z-]+$/.test(pulito);
    return validi.has(pulito) || pillarOnly ? `[${testo}](${pulito})` : testo;
  });
}

async function correggi(richiesta) {
  conversazione.push({ role: 'user', content: `${richiesta}\n\nRestituisci di nuovo il JSON completo, con lo stesso schema, SOLO il JSON.` });
  try {
    const r = await chiedi(conversazione);
    conversazione.push({ role: 'assistant', content: r.content });
    pagina = jsonDa(r.testo);
  } catch (e) {
    rinuncia(`correzione fallita (${e.message})`);
  }
}

// Controllo meccanico: numeri e struttura. Fino a due correzioni.
async function controlloMeccanico() {
  for (let tentativo = 0; ; tentativo++) {
    pulisciLinkEsterni(pagina);
    const numeri = numeriNonVerificati(pagina);
    const struttura = problemiStruttura(pagina);
    if (numeri.length === 0 && struttura.length === 0) return;
    if (tentativo >= 2) {
      report.ultimiProblemi = { numeri, struttura };
      rinuncia(`dopo due correzioni restano ${numeri.length} numeri non verificati e ${struttura.length} problemi di struttura`);
    }
    console.log(`  correzione: ${numeri.length} numeri non verificati, ${struttura.length} problemi di struttura`);
    await correggi(
      [
        numeri.length
          ? `Questi numeri NON sono tra i dati verificati. Togli il numero o sostituiscilo con un valore dell'elenco, senza inventare:\n${numeri
              .map((n) => `- ${n.dove}: "${n.numero}" in «…${n.contesto}…»`)
              .join('\n')}`
          : '',
        struttura.length ? `Problemi di struttura da correggere:\n${struttura.map((x) => `- ${x}`).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    );
  }
}

// Revisione ostile del significato: un numero giusto può stare in una frase
// sbagliata (altro denominatore, arrivi invece di presenze, regione presa per
// Italia) e le frasi senza numeri sfuggono al controllo meccanico. Nella prova del
// 7 ottobre erano uscite «una proporzione inversa rispetto alla media nazionale»
// (falso) e «su casemobiliusate.com osserviamo che...» (inventato).
const datiConFrase = verificati
  .map((d) => `${d.id} | ${d.dato} | ${d.valore} ${d.unita || ''} | anno ${d.anno} | ${d.area || ''} | ${d.ente}, ${d.documento} | frase della fonte: «${String(d.frase).slice(0, 300)}»`)
  .join('\n');
const ESITO_REVISIONE = `Per ogni problema indica la gravità:
- "grave": la frase dice una cosa falsa o non sostenuta (significato del numero sbagliato, conclusione o confronto che i dati non contengono, opinione, osservazione o consiglio senza dato, fonte sbagliata, classifica o primato dedotto da una sola quota);
- "lieve": la frase è vera ma si potrebbe scrivere meglio (formulazione più precisa, segno + davanti a una variazione positiva, anno da ripetere).
Rispondi SOLO con un JSON valido: {"problemi":[{"dove":"campo (titolo, tldr, corpo, faq N, immagine, meta)","testo":"la frase esatta","dato_id":"id del dato coinvolto, o stringa vuota","gravita":"grave","motivo":"perché è sbagliata","correzione":"frase corretta, oppure RIMUOVERE"}]}. Lista vuota se non trovi nulla.`;

// Due revisori in parallelo con compiti diversi: nella prova del 7 ottobre un
// revisore unico aveva lasciato passare «le presenze italiane pesano il 14,7%»
// (era il totale) e «il 29% dei tedeschi sceglie il campeggio» (erano le notti).
const LENTI = [
  `Controlla SOLO questo: per ogni numero, su quale totale è calcolato (quota di cosa su cosa) e quale unità misura. Errori tipici: un totale presentato come dato di un sottogruppo (tutti i clienti presentati come italiani), un sottogruppo presentato come totale, notti o presenze presentate come persone («il 29% dei tedeschi sceglie» quando il dato è il 29% delle notti dei tedeschi), arrivi scambiati con presenze, una quota letta al contrario (quota dei campeggi sull'extra-alberghiero contro quota dell'extra-alberghiero nei campeggi), punti percentuali scambiati con percentuali.`,
  `Controlla SOLO questo: area, anno, tipo di struttura e fonte di ogni numero, e le frasi senza numeri. Errori tipici: un dato regionale presentato come nazionale o viceversa, un dato UE presentato come italiano, un anno diverso da quello della fonte, un dato su tutte le strutture presentato come dato sui campeggi, un dato attribuito all'ente sbagliato; e poi confronti, classifiche, primati, tendenze, cause, consigli o osservazioni che i dati non contengono.`,
];

async function revisioneSignificato() {
  const testo = JSON.stringify({
    titolo: pagina.titolo, sottotitolo: pagina.sottotitolo, metaDescription: pagina.metaDescription, tldr: pagina.tldr,
    immagine: pagina.immagine, altImmagine: pagina.altImmagine, faq: pagina.faq, corpo: pagina.body,
  });
  const esiti = await Promise.all(
    LENTI.map((lente) =>
      anthropic.messages
        .create({
          model: MODEL,
          max_tokens: 8000,
          messages: [{ role: 'user', content: `Sei un fact-checker ostile: il tuo compito è trovare errori, non approvare.

Questi sono gli UNICI dati verificati su cui la pagina può basarsi, ognuno con la frase originale della fonte:
${datiConFrase}

Questa è la pagina:
${testo}

${lente}
Le frasi che spiegano come leggere i dati vanno bene se corrette. Non segnalare formulazioni vere.

${ESITO_REVISIONE}` }],
        })
        .then((r) => (jsonDa(testoFinale(r.content)).problemi || []).filter((x) => x?.testo))
    )
  );
  const visti = new Set();
  return esiti.flat().filter((x) => {
    const k = String(x.testo).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    if (visti.has(k)) return false;
    visti.add(k);
    return true;
  });
}

await controlloMeccanico();
console.log('4/5 Controllo meccanico superato: numeri verificati, struttura completa.');

// Le correzioni del significato le applica lo SCRIPT, non lo scrittore: nella
// prova del 7 ottobre, chiedendo allo scrittore di correggere, il numero di frasi
// contestate non scendeva (3, 6, 5, 10) perché a ogni giro riscriveva anche altro.
// Primo giro: la frase contestata si sostituisce con la correzione del revisore
// (o si toglie, se la correzione contiene numeri non verificati). Dal secondo
// giro le frasi ancora contestate si tolgono e basta: togliere non introduce
// errori nuovi, quindi il ciclo converge. I titoli non si toccano mai.

const CAMPI_TESTO = ['titolo', 'sottotitolo', 'metaDescription', 'tldr', 'altImmagine', 'body'];

// Trova `cercato` dentro `s` ignorando grassetti e spazi diversi; restituisce
// l'intervallo nel testo originale, oppure null.
function trovaSpan(s, cercato) {
  const pulisci = (x) => x.replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  const ago = pulisci(String(cercato)).replace(/^[«"“]|[»"”]$/g, '');
  if (ago.length < 8) return null;
  let t = '';
  const mappa = [];
  for (let i = 0; i < s.length; i++) {
    if ((s[i] === '*' && s[i + 1] === '*') || (s[i] === '_' && s[i + 1] === '_')) { i++; continue; }
    if (/\s/.test(s[i])) {
      if (t.endsWith(' ')) continue;
      t += ' ';
    } else t += s[i];
    mappa.push(i);
  }
  const k = t.indexOf(ago);
  if (k < 0) return null;
  const inizio = mappa[k];
  let fine = mappa[k + ago.length - 1] + 1;
  while (s.slice(fine, fine + 2) === '**') fine += 2; // chiude il grassetto rimasto aperto
  return [inizio, fine];
}

function numeriNonAmmessi(testo) {
  return numeriIn(testo).some((n) => {
    if (n.vals.every((x) => x >= 1990 && x <= 2035 && Number.isInteger(x))) return false;
    if (n.vals.every((x) => Number.isInteger(x) && x <= 12) && !/^\s*(%|per cento|€|euro)/.test(n.dopo)) return false;
    return !n.vals.some((x) => ammessi.some((a) => vicino(x, a, 0.025)));
  });
}

// Applica una correzione; restituisce true se la frase è stata trovata e trattata.
function applica(problema, soloRimozione) {
  const correzione = String(problema.correzione || '').trim();
  const rimuovi = soloRimozione || !correzione || /^RIMUOVERE$/i.test(correzione) || numeriNonAmmessi(correzione);
  const sostituisci = (s) => {
    const span = trovaSpan(s, problema.testo);
    if (!span) return null;
    const [a, b] = span;
    const rigaInizio = s.lastIndexOf('\n', a - 1) + 1;
    const rigaFine = s.indexOf('\n', b) < 0 ? s.length : s.indexOf('\n', b);
    const riga = s.slice(rigaInizio, rigaFine);
    if (/^#{1,6}\s/.test(riga)) return null; // titoli di sezione: mai
    if (rimuovi && /^\s*\|/.test(riga)) return s.slice(0, rigaInizio) + s.slice(Math.min(s.length, rigaFine + 1)); // riga di tabella
    const nuovo = rimuovi ? '' : correzione;
    return (s.slice(0, a) + nuovo + s.slice(b)).replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:])/g, '$1');
  };
  for (const campo of CAMPI_TESTO) {
    if (typeof pagina[campo] !== 'string') continue;
    if (campo === 'titolo' && rimuovi) continue; // il titolo non si svuota
    const r = sostituisci(pagina[campo]);
    if (r !== null) {
      pagina[campo] = r;
      return true;
    }
  }
  for (const f of pagina.faq || []) {
    for (const campo of ['risposta', 'domanda']) {
      const r = sostituisci(f[campo] || '');
      if (r !== null) {
        if (campo === 'domanda' && rimuovi) f.risposta = ''; // FAQ intera via
        else f[campo] = r;
        return true;
      }
    }
  }
  for (const v of pagina.immagine?.voci || []) {
    if (trovaSpan(`${v.grande} ${v.testo} ${v.fonte}`, problema.testo) || trovaSpan(v.testo || '', problema.testo)) {
      v.via = true; // la voce dell'immagine si toglie
      return true;
    }
  }
  return false;
}

function riordina() {
  pagina.faq = (pagina.faq || []).filter((f) => String(f.risposta || '').trim().split(/\s+/).length >= 8);
  if (pagina.immagine?.voci) pagina.immagine.voci = pagina.immagine.voci.filter((v) => !v.via);
  pagina.body = String(pagina.body || '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
}

const MISURE = { metaDescription: [120, 160], titolo: [30, 70] };
async function rimisura() {
  for (const [campo, [min, max]] of Object.entries(MISURE)) {
    for (let t = 0; t < 3; t++) {
      const v = String(pagina[campo] || '');
      if (v.length >= min && v.length <= max + 5 && !numeriNonAmmessi(v)) break;
      if (t === 2) return; // ci pensa il controllo di struttura, che rinuncia
      const r = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: `Riscrivi ${campo === 'titolo' ? 'il titolo' : 'la meta description'} di una pagina di statistiche: tra ${min} e ${max} caratteri, con le parole di "${tema.focusKeyword}" ${campo === 'titolo' ? "all'inizio" : 'nei primi 130 caratteri'}, in italiano corretto (con articoli e preposizioni, mai incollate sgrammaticate). Usa SOLO informazioni e numeri presenti in questo riassunto già verificato, senza aggiungere altro:\n${String(pagina.tldr).replace(/<[^>]+>/g, '')}\n\nVersione attuale (${v.length} caratteri): ${v}\n\nRispondi solo con il testo, senza virgolette.` }],
      });
      pagina[campo] = testoFinale(r.content).trim().replace(/^["«]|["»]$/g, '');
    }
  }
}

report.revisioni = [];
const MAX_GIRI = 4;
for (let giro = 0; ; giro++) {
  let problemi;
  try {
    problemi = await revisioneSignificato();
  } catch (e) {
    rinuncia(`revisione del significato non eseguita (${e.message.slice(0, 160)})`);
  }
  const gravi = problemi.filter((x) => x.gravita !== 'lieve');
  report.revisioni.push(gravi);
  if (gravi.length === 0) break;
  if (giro >= MAX_GIRI - 1) {
    report.ultimiProblemi = { significato: gravi };
    rinuncia(`dopo ${MAX_GIRI - 1} giri di correzioni la revisione trova ancora ${gravi.length} frasi non sostenute dai dati`);
  }
  const soloRimozione = giro >= 1;
  const nonTrovate = gravi.filter((x) => !applica(x, soloRimozione));
  riordina();
  console.log(`  revisione ${giro + 1}: ${gravi.length} frasi non sostenute dai dati, ${soloRimozione ? 'tolte' : 'corrette'} ${gravi.length - nonTrovate.length}, non ritrovate ${nonTrovate.length}`);
  if (nonTrovate.length) report.nonRitrovate = [...(report.nonRitrovate || []), ...nonTrovate];
  // Una correzione può allungare o accorciare titolo e meta description oltre la
  // misura: si riscrive solo quel campo, partendo dal tldr già revisionato.
  await rimisura();
  // Dopo le modifiche, numeri e struttura devono reggere ancora.
  pulisciLinkEsterni(pagina);
  const numeri = numeriNonVerificati(pagina);
  const struttura = problemiStruttura(pagina);
  if (numeri.length || struttura.length) {
    report.ultimiProblemi = { numeri, struttura };
    rinuncia(`dopo le correzioni del significato: ${numeri.length} numeri non verificati, problemi di struttura: ${struttura.join('; ') || 'nessuno'}`);
  }
}
console.log('5/5 Revisione del significato superata.');

// ─── Scrittura dei file ──────────────────────────────────────────────
function sanitizeAngles(s) {
  return typeof s === 'string' ? s.replace(/<(?![A-Za-z/!])/g, '&lt;') : s;
}
function sanitizeMdxBody(s) {
  return typeof s === 'string' ? sanitizeAngles(s).replace(/\{/g, '&#123;').replace(/\}/g, '&#125;') : s;
}
function y(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}
function xml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function aCapo(testo, max) {
  const righe = [];
  let riga = '';
  for (const parola of String(testo).split(/\s+/)) {
    if ((riga + ' ' + parola).trim().length > max) {
      if (riga) righe.push(riga);
      riga = parola;
    } else riga = (riga + ' ' + parola).trim();
  }
  if (riga) righe.push(riga);
  return righe;
}

const oggi = new Date().toISOString().slice(0, 10);
const immagineNome = `${tema.slug}.jpg`;
const immaginePath = `/images/${immagineNome}`;

// Fonti per lo schema Dataset: una per documento; URL solo se di dominio ammesso.
const fontiDataset = [];
for (const url of fonti) {
  const d = verificati.find((x) => x.url === url);
  const nome = `${d.ente}, ${d.documento}`;
  if (!fontiDataset.some((f) => f.nome === nome)) fontiDataset.push(inWhitelist(url) ? { nome, url } : { nome });
}

const p = pagina;
p.body = sanitizeMdxBody(p.body);
p.tldr = sanitizeAngles(p.tldr);
for (const f of p.faq) {
  f.domanda = sanitizeAngles(f.domanda);
  f.risposta = sanitizeAngles(f.risposta);
}
const correlati = (p.articoliCorrelati || [])
  .map((s) => s.replace(/^\//, '').replace(/\/$/, ''))
  .filter((s) => articoliEsistenti.some((a) => a.path === `/${s}`));

const fm = [
  '---',
  `titolo: "${y(p.titolo)}"`,
  `sottotitolo: "${y(p.sottotitolo)}"`,
  `pillar: "${tema.pillar}"`,
  `slug: "${tema.slug}"`,
  `legacyPath: "${pageUrl}"`,
  `focusKeyword: "${y(p.focusKeyword || tema.focusKeyword)}"`,
  `keywordsSecondarie:\n${(p.keywordsSecondarie || []).map((k) => `  - "${y(k)}"`).join('\n')}`,
  `metaDescription: "${y(p.metaDescription)}"`,
  `coverImage: "${immaginePath}"`,
  `coverImageAlt: "${y(p.altImmagine)}"`,
  `dataPubblicazione: ${oggi}`,
  `dataAggiornamento: ${oggi}`,
  `autore: "andrea-bressan"`,
  `readingTime: ${Number(p.readingTime) || 9}`,
  `tldr: "${y(p.tldr)}"`,
  correlati.length ? `articoliCorrelati:\n${correlati.map((s) => `  - "${s}"`).join('\n')}` : '',
  'dataset:',
  `  nome: "${y(p.dataset.nome)}"`,
  `  descrizione: "${y(p.dataset.descrizione)}"`,
  `  copertura: "${y(p.dataset.copertura)}"`,
  `  area: "${y(p.dataset.area || 'Italia')}"`,
  `  parole: [${(p.dataset.parole || []).map((w) => `"${y(w)}"`).join(', ')}]`,
  '  fonti:',
  ...fontiDataset.flatMap((f) => [`    - nome: "${y(f.nome)}"`, ...(f.url ? [`      url: "${y(f.url)}"`] : [])]),
  `faq:\n${p.faq.map((f) => `  - domanda: "${y(f.domanda)}"\n    risposta: "${y(f.risposta)}"`).join('\n')}`,
  '---',
]
  .filter(Boolean)
  .join('\n');

const mdx = `${fm}\n\n${p.body.trim()}\n`;

// Immagine con i numeri principali (stessa impaginazione della pagina di ottobre 2026).
const voci = (p.immagine.voci || []).slice(0, 6);
const W = 1600, H = 900, X0 = 96, GAP = 28;
const colW = (W - 2 * X0 - 3 * GAP) / 4;
let svgVoci = '';
voci.forEach((v, i) => {
  const riga = i < 4 ? 0 : 1;
  const colonne = riga === 0 ? Math.min(4, voci.length) : voci.length - 4;
  const larghezza = riga === 0 ? colW : (W - 2 * X0 - GAP) / 2;
  const x = X0 + (riga === 0 ? i : i - 4) * (larghezza + GAP);
  const y0 = riga === 0 ? 230 : 503;
  if (colonne <= 0) return;
  const testo = aCapo(v.testo, riga === 0 ? 30 : 62).slice(0, 3);
  svgVoci += `<rect x="${x}" y="${y0}" width="${larghezza}" height="4" fill="#9a7b45"/>`;
  svgVoci += `<text x="${x}" y="${y0 + 88}" font-family="Georgia, 'DejaVu Serif', serif" font-weight="700" font-size="72" fill="#2c3a28">${xml(v.grande)}</text>`;
  testo.forEach((t, k) => {
    svgVoci += `<text x="${x}" y="${y0 + 142 + k * 34}" font-family="Helvetica, Arial, 'DejaVu Sans', sans-serif" font-size="24" fill="#2b2b2b">${xml(t)}</text>`;
  });
  svgVoci += `<text x="${x}" y="${y0 + 142 + testo.length * 34}" font-family="Helvetica, Arial, 'DejaVu Sans', sans-serif" font-size="24" fill="#2b2b2b">${xml(v.fonte)}</text>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#f8f5ef"/>
<text x="${X0}" y="90" font-family="Helvetica, Arial, 'DejaVu Sans', sans-serif" font-weight="700" font-size="24" letter-spacing="5" fill="#8a6a35">${xml(String(p.immagine.occhiello).toUpperCase())}</text>
<text x="${X0}" y="170" font-family="Georgia, 'DejaVu Serif', serif" font-weight="700" font-size="62" fill="#2c3a28">${xml(p.immagine.titolo)}</text>
${svgVoci}
<rect x="${X0}" y="788" width="${W - 2 * X0}" height="1" fill="#d9d3c7"/>
<text x="${X0}" y="830" font-family="Helvetica, Arial, 'DejaVu Sans', sans-serif" font-size="21" fill="#6b6b6b">Aggiornato ${xml(mese)}</text>
<text x="${W - X0}" y="830" text-anchor="end" font-family="Helvetica, Arial, 'DejaVu Sans', sans-serif" font-weight="700" font-size="21" fill="#2c3a28">casemobiliusate.com</text>
</svg>`;

// Link interni dagli articoli collegati (passo 6 del metodo).
const modifiche = [];
for (const l of (p.linkDa || []).slice(0, 3)) {
  const a = articoliEsistenti.find((x) => x.path === String(l.path).replace(/\/$/, ''));
  if (!a) continue;
  const file = path.join(articoliDir, a.file);
  const contenuto = fs.readFileSync(file, 'utf-8');
  if (contenuto.includes(`](${pageUrl})`)) continue;
  const anchor = String(l.anchor || p.titolo).replace(/[[\]()]/g, '');
  modifiche.push({ file, nuovo: `${contenuto.trimEnd()}\n\nI numeri aggiornati, con l'ente e l'anno di ogni dato, sono raccolti in [${anchor}](${pageUrl}).\n` });
}

if (DRY_RUN) {
  const out = path.join(projectRoot, 'stats-dry-run');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `${tema.slug}.mdx`), mdx);
  await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(path.join(out, immagineNome));
  fs.writeFileSync(path.join(out, 'link-interni.json'), JSON.stringify(modifiche.map((m) => ({ file: path.basename(m.file), coda: m.nuovo.slice(-220) })), null, 2));
  report.esito = 'prova riuscita (DRY_RUN, nessun file del sito toccato)';
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  fs.copyFileSync(reportFile, path.join(out, 'report.json'));
  console.log(`\nProva completata: file in ${out}`);
  process.exit(0);
}

const creati = [];
try {
  const mdxFile = path.join(articoliDir, `${tema.slug}.mdx`);
  fs.writeFileSync(mdxFile, mdx, 'utf-8');
  creati.push(mdxFile);
  const imgFile = path.join(imagesDir, immagineNome);
  await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(imgFile);
  creati.push(imgFile);
  for (const m of modifiche) fs.writeFileSync(m.file, m.nuovo, 'utf-8');
} catch (e) {
  for (const f of creati) fs.rmSync(f, { force: true });
  rinuncia(`scrittura dei file fallita (${e.message})`);
}

// Per il commit e per request-indexing.mjs, che leggono last-research.json.
fs.writeFileSync(
  path.join(__dirname, 'last-research.json'),
  JSON.stringify({ week: oggi, tipo: 'statistiche', chosenKeyword: p.focusKeyword || tema.focusKeyword, slug: tema.slug, pillar: tema.pillar, secondaryKeywords: p.keywordsSecondarie || [] }, null, 2)
);
report.esito = 'pubblicata';
report.url = `https://www.casemobiliusate.com${pageUrl}`;
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
console.log(`\nPagina di statistiche scritta: ${pageUrl} (${verificati.length} dati, ${fonti.length} fonti, ${modifiche.length} link interni aggiunti)`);

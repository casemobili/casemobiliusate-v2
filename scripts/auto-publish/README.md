# Pipeline auto-publish settimanale

Pipeline che ogni lunedì e giovedì alle 09:13 (ora italiana) pubblica un contenuto nuovo:

1. **Modalità** — `choose-mode.mjs`: la prima uscita di ogni mese è una pagina di statistiche, le altre sono articoli
2. **Keyword research** — fetch Google Suggest su 18 seed keyword + modificatori → 100+ candidati ranked
3. **Article generation** — Claude API (claude-opus-4-5) con system prompt strutturato più `conoscenze-seo-geo.md`
4. **Validation** — controllo Rank Math 90+ score (title, meta, body length, FAQ count, internal links)
5. **Build + controlli** — Astro build, `check-identita.mjs` (blocca se compaiono nomi estranei al progetto), scripts/seo-ultimate-audit.mjs
6. **Commit + push** — auto-commit, Cloudflare Pages deploy automatico

## Conoscenze SEO e GEO (`conoscenze-seo-geo.md`)

Regole operative distillate dalle note di studio e dalle fonti ufficiali (Google Search Central e simili), una riga ciascuna con la fonte tra parentesi. Il generatore degli articoli le aggiunge al system prompt a ogni uscita; in caso di conflitto vince il system prompt. Si aggiornano una volta a settimana con un'attività pianificata, che verifica ogni regola nuova contro la fonte prima del commit. Il generatore delle statistiche non le usa: ha il proprio metodo.

## Pagina di statistiche mensile (`generate-stats.mjs`)

Una al mese, sul primo tema libero di `stats-themes.json`. Metodo dei linkable asset: titoli a domanda con la risposta subito, tabelle, immagine con i numeri, schema Dataset con licenza CC BY 4.0, link dagli articoli collegati.

1. **Ricerca** — la ricerca web trova 8-14 documenti di enti pubblici e federazioni (senza aprirli).
2. **Estrazione e verifica** — ogni documento si scarica e si legge da solo; un verificatore ostile, con il documento davanti, deve ritrovare la frase esatta di ogni numero e correggere la descrizione del dato (unità, totale, area, periodo).
3. **Scrittura** — solo con i dati verificati; niente calcoli, classifiche su elenchi incompleti, osservazioni o consigli.
4. **Controllo meccanico** — ogni numero del testo deve corrispondere a un dato verificato; link esterni solo agli URL esatti delle fonti di dominio ammesso.
5. **Revisione del significato** — due revisori con compiti diversi; le correzioni le applica lo script, dal secondo giro solo togliendo frasi.

Se mancano dati verificati o i controlli non passano, lo script esce con codice 3 senza scrivere nulla: quell'uscita diventa un articolo normale e la pagina di statistiche ci riprova all'uscita successiva. Rapporto di ogni tentativo in `last-stats-report.json`. Prova senza pubblicare: `DRY_RUN=1 node scripts/auto-publish/generate-stats.mjs` (scrive in `stats-dry-run/`).

## Setup iniziale (UNA TANTUM)

### 1. Aggiungi GitHub secret `ANTHROPIC_API_KEY`

1. Vai su https://github.com/casemobili/casemobiliusate-v2/settings/secrets/actions
2. Click "New repository secret"
3. Name: `ANTHROPIC_API_KEY`
4. Secret: la tua API key Anthropic (https://console.anthropic.com/settings/keys)
5. "Add secret"

### 2. Verifica workflow attivo

1. Vai su https://github.com/casemobili/casemobiliusate-v2/actions/workflows/weekly-article.yml
2. Click "Run workflow" per testarlo manualmente subito
3. Verifica che esegua tutti i 7 step senza errori

## Esecuzione locale (testing)

```bash
cd draft-site
export ANTHROPIC_API_KEY="sk-ant-..."
node scripts/auto-publish/keyword-research.mjs
node scripts/auto-publish/generate-article.mjs
npm run build
```

## Costi mensili stimati

- Claude API claude-opus-4-5: ~$0.10-0.30 per articolo (con prompt caching)
- 4 articoli/mese = ~$0.40-1.20/mese
- GitHub Actions: gratis (entro i 2000 min/mese del piano free)

## Strategia SEO

- **Targeting**: long-tail (3-4 parole) con keyword density score > 60
- **Pillar mapping**: ogni keyword classificata automaticamente nel pillar pertinente
- **Internal linking**: ogni articolo deve avere min 3 link a pillar/cluster correlati
- **Schema markup**: BaseLayout aggiunge automatic Article + BreadcrumbList + FAQPage
- **Validation**: articoli che falliscono Rank Math sono marcati `noindex: true` finché non vengono rivisti dal CMS

## Override / pause manuale

- **Pausa temporanea**: vai su workflow page, click "..." → "Disable workflow"
- **Genera articolo extra**: workflow_dispatch dalla UI GitHub (in qualsiasi giorno)
- **Cambia frequenza**: edita `cron: '13 7 * * 1'` in `weekly-article.yml`
  - Bisettimanale: `'13 7 * * 1,4'` (lun + gio)
  - Bimestrale: `'13 7 1,15 * *'` (1 e 15 del mese)

## Override keyword

Se vuoi forzare un articolo su una keyword specifica invece dell'auto-research:

```bash
cat > scripts/auto-publish/last-research.json << EOF
{
  "week": "2026-05-08",
  "chosenKeyword": "tua keyword qui",
  "score": 100,
  "slug": "tuo-slug-qui",
  "pillar": "guide-acquisto",
  "secondaryKeywords": ["sinonimo1", "sinonimo2"]
}
EOF
node scripts/auto-publish/generate-article.mjs
```

## Modifica articoli generati

Tutti gli articoli auto-generati finiscono in `src/content/articoli/<slug>.mdx`. Sono **modificabili da CMS Sveltia** all'admin/ → categoria "Articoli". Dal CMS si può:

- Editare titolo, body, FAQ, focus keyword, meta description
- Aggiungere coverImage personalizzata (override del default og-default.jpg)
- Linkare articoliCorrelati pertinenti
- Cambiare `noindex: true → false` quando l'articolo è pronto per pubblicazione

## Quality gates automatici

Articoli auto-marcati `noindex: true` se falliscono validazione:
- titolo < 30 o > 75 caratteri
- meta < 120 o > 165 caratteri
- body < 1200 parole
- FAQ < 5
- internal links < 3

## Indicizzazione automatica (request-indexing.mjs)

Dopo ogni pubblicazione, il workflow notifica i motori di ricerca dell'URL nuovo (+ home).
Due canali:

### 1. IndexNow — attivo, nessun setup
Notifica Bing, Yandex, Seznam, Naver (e alcuni crawler AI). Funziona già.
- Chiave: `c8f7e87cf88cb237a0269d17d8a74d24`
- File di verifica: `public/c8f7e87cf88cb237a0269d17d8a74d24.txt` (servito su `https://www.casemobiliusate.com/<key>.txt`)
- NON cancellare quel file: IndexNow verifica la proprietà del dominio leggendolo.

### 2. Google Indexing API — opzionale, attivazione una-tantum
È il canale che conta per Google. Si attiva da solo appena esiste il secret `GOOGLE_INDEXING_SA_KEY`.
Setup (una volta sola, richiede Google Cloud + Search Console):

1. Google Cloud Console → crea un progetto → abilita "Indexing API".
2. Crea un **Service Account** → crea una **chiave JSON** → scaricala.
3. In Search Console (proprietà casemobiliusate.com) → Impostazioni → Utenti e autorizzazioni → aggiungi l'**email del service account** come **Proprietario**.
4. In GitHub → repo → Settings → Secrets and variables → Actions → New secret:
   - Nome: `GOOGLE_INDEXING_SA_KEY`
   - Valore: incolla l'intero contenuto del file JSON.
5. Fatto. Dal commit successivo ogni articolo nuovo viene sottoposto a Google automaticamente.

NB: l'Indexing API di Google è ufficialmente per JobPosting/BroadcastEvent ma è prassi diffusa per URL generici e accelera molto la scoperta. Se non attivi questo canale, Google scopre comunque gli articoli via sitemap (più lento).

### Esecuzione manuale (per sottomettere subito un URL già pubblicato)
```bash
node scripts/auto-publish/request-indexing.mjs   # usa last-research.json
```

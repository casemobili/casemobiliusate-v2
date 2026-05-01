# Pipeline auto-publish settimanale

Pipeline che ogni lunedì alle 09:13 (ora italiana) genera un articolo nuovo:

1. **Keyword research** — fetch Google Suggest su 18 seed keyword + modificatori → 100+ candidati ranked
2. **Article generation** — Claude API (claude-opus-4-5) con system prompt strutturato
3. **Validation** — controllo Rank Math 90+ score (title, meta, body length, FAQ count, internal links)
4. **Build + SEO audit** — Astro build + scripts/seo-ultimate-audit.mjs
5. **Commit + push** — auto-commit, Cloudflare Pages deploy automatico

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
- **Validation**: articoli che falliscono Rank Math sono marcati `noindex: true` finché Mattia non li rivede dal CMS

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

Tutti gli articoli auto-generati finiscono in `src/content/articoli/<slug>.mdx`. Sono **modificabili da CMS Sveltia** all'admin/ → categoria "Articoli". Mattia può:

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

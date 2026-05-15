import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

// Feed RSS automatico per casemobiliusate.com.
// Include tutti gli articoli MDX della collection 'articoli' (escludi noindex).
// URL: https://www.casemobiliusate.com/rss.xml

const PILLAR_LABELS: Record<string, string> = {
  'normativa': 'Normativa & Permessi',
  'prezzi': 'Prezzi & Valutazione',
  'marche': 'Marche & Modelli',
  'trasporto': 'Trasporto & Installazione',
  'vivere': 'Vivere in Casa Mobile',
  'dove-mettere': 'Dove Mettere & Campeggi',
  'tipologie': 'Confronti & Tipologie',
  'guide-acquisto': "Guide all'Acquisto",
};

export async function GET(context: APIContext) {
  const articoli = await getCollection('articoli', ({ data }) => !data.noindex);

  // Ordina per dataPubblicazione (più recenti prima)
  const sorted = articoli.sort((a, b) => {
    const da = a.data.dataAggiornamento ?? a.data.dataPubblicazione;
    const db = b.data.dataAggiornamento ?? b.data.dataPubblicazione;
    return db.valueOf() - da.valueOf();
  });

  return rss({
    title: 'CaseMobiliUsate.com — Guide tecniche, normative, prezzi reali',
    description:
      'Tutti i nuovi articoli pubblicati: normativa, prezzi, marche, trasporto, vivere in casa mobile, dove metterle. Sito informativo indipendente curato da Andrea Bressan.',
    site: context.site ?? 'https://www.casemobiliusate.com',
    items: sorted.map((articolo) => {
      const slug = articolo.data.slug ?? articolo.id.replace(/\.(mdx?|md)$/i, '');
      const url = articolo.data.legacyPath ?? `/articoli/${slug}`;
      const pillarLabel = PILLAR_LABELS[articolo.data.pillar] ?? articolo.data.pillar;
      return {
        title: articolo.data.titolo,
        description: articolo.data.metaDescription,
        link: url,
        pubDate: articolo.data.dataPubblicazione,
        categories: [pillarLabel],
        author: 'andrea-bressan@casemobiliusate.com (Andrea Bressan)',
      };
    }),
    customData: `
      <language>it-it</language>
      <copyright>© 2026 CMU Edizioni</copyright>
      <managingEditor>info@casemobiliusate.com (Andrea Bressan)</managingEditor>
      <webMaster>info@casemobiliusate.com (Andrea Bressan)</webMaster>
      <generator>Astro v5</generator>
      <ttl>360</ttl>
    `.trim(),
    stylesheet: false,
  });
}

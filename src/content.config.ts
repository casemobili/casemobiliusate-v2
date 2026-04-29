import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro:content';

const articoli = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/articoli' }),
  schema: z.object({
    titolo: z.string(),
    sottotitolo: z.string(),
    pillar: z.enum(['normativa', 'prezzi', 'marche', 'trasporto', 'vivere', 'dove-mettere', 'tipologie', 'guide-acquisto']),
    focusKeyword: z.string(),
    keywordsSecondarie: z.array(z.string()).default([]),
    metaDescription: z.string(),
    coverImage: z.string().optional(),
    coverImageAlt: z.string().optional(),
    coverImageCredit: z.string().optional(),
    dataPubblicazione: z.coerce.date(),
    dataAggiornamento: z.coerce.date().optional(),
    autore: z.string().default('andrea-bressan'),
    readingTime: z.number().default(5),
    tldr: z.string().optional(),
    faq: z
      .array(z.object({ domanda: z.string(), risposta: z.string() }))
      .default([]),
    articoliCorrelati: z.array(z.string()).default([]),
    noindex: z.boolean().default(false),
  }),
});

const pillar = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/pillar' }),
  schema: z.object({
    titolo: z.string(),
    descrizione: z.string(),
    focusKeyword: z.string().optional(),
    metaDescription: z.string().optional(),
    faq: z
      .array(z.object({ domanda: z.string(), risposta: z.string() }))
      .default([]),
  }),
});

const autori = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx,json,yaml,yml}', base: './src/content/autori' }),
  schema: z.object({
    nome: z.string(),
    ruolo: z.string(),
    bio: z.string(),
    avatar: z.string().optional(),
    isPseudonym: z.boolean().default(false),
  }),
});

export const collections = { articoli, pillar, autori };

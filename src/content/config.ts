// Astro Content Collections — schema definito per matchare admin/config.yml di Sveltia CMS
// Ogni articolo creato dal CMS finisce in src/content/articoli/<slug>.mdx
// Il routing src/pages/articoli/[...slug].astro li serve dinamicamente.

import { defineCollection, z } from 'astro:content';

const articoli = defineCollection({
  type: 'content',
  schema: z.object({
    titolo: z.string().min(20).max(80),
    sottotitolo: z.string().min(80).max(280),
    pillar: z.enum(['normativa', 'prezzi', 'marche', 'trasporto', 'vivere', 'dove-mettere', 'tipologie', 'guide-acquisto']),
    focusKeyword: z.string().min(2).max(60),
    keywordsSecondarie: z.array(z.string()).optional().default([]),
    metaDescription: z.string().min(120).max(160),
    coverImage: z.string().optional(),
    coverImageAlt: z.string().optional(),
    coverImageCredit: z.string().optional(),
    dataPubblicazione: z.coerce.date(),
    dataAggiornamento: z.coerce.date().optional(),
    autore: z.string().default('andrea-bressan'),
    readingTime: z.number().int().min(1).max(60).default(5),
    tldr: z.string().optional(),
    faq: z.array(z.object({
      domanda: z.string(),
      risposta: z.string(),
    })).optional().default([]),
    articoliCorrelati: z.array(z.string()).optional().default([]),
    noindex: z.boolean().default(false),
  }),
});

const pillar = defineCollection({
  type: 'content',
  schema: z.object({
    titolo: z.string(),
    descrizione: z.string(),
    focusKeyword: z.string().optional(),
    metaDescription: z.string().optional(),
    faq: z.array(z.object({
      domanda: z.string(),
      risposta: z.string(),
    })).optional().default([]),
  }),
});

const autori = defineCollection({
  type: 'data',
  schema: z.object({
    nome: z.string(),
    ruolo: z.string(),
    bio: z.string(),
    avatar: z.string().optional(),
    isPseudonym: z.boolean().default(false),
  }),
});

export const collections = {
  articoli,
  pillar,
  autori,
};

/*
 * SEO Score — compatibile Rank Math (basato sulle regole pubbliche del plugin)
 * Riferimento: https://rankmath.com/kb/score-100-in-tests/
 *
 * Funzione pura: accetta oggetto descrittivo dell'articolo, restituisce
 * { score: 0-100, level: 'bad'|'average'|'good', checks: Check[] }.
 *
 * Usabile lato server (build) o lato client (editor live).
 */

export type CheckLevel = 'pass' | 'warn' | 'fail';
export type CheckCategory = 'basic' | 'title' | 'content' | 'links' | 'images' | 'readability' | 'schema';

export interface Check {
  id: string;
  category: CheckCategory;
  level: CheckLevel;
  weight: number;
  label: string;
  hint?: string;
}

export interface SeoInput {
  title: string;
  metaDescription: string;
  slug: string;
  focusKeyword: string;
  keywordsSecondarie?: string[];
  content: string; // markdown o testo
  contentType?: 'pillar' | 'cluster';
  hasCoverImage?: boolean;
  coverImageAlt?: string;
  imagesInContentCount?: number;
  imagesWithAltCount?: number;
  internalLinksCount?: number;
  externalLinksCount?: number;
  externalDofollowCount?: number;
  headings?: { level: number; text: string }[];
  faqCount?: number;
  hasSchemaArticle?: boolean;
  hasSchemaBreadcrumb?: boolean;
}

export interface SeoResult {
  score: number; // 0-100
  level: 'bad' | 'average' | 'good';
  checks: Check[];
  passed: number;
  failed: number;
  warned: number;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const containsKeyword = (haystack: string, kw: string): boolean => {
  if (!kw) return false;
  return norm(haystack).includes(norm(kw));
};

const wordCount = (text: string): number => {
  return (text.match(/\b\p{Letter}+\b/gu) || []).length;
};

const stripMarkdown = (md: string): string => {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~]/g, ' ')
    .replace(/\s+/g, ' ');
};

const sentenceLengths = (text: string): number[] => {
  return text
    .split(/[.!?]+/)
    .map((s) => wordCount(s))
    .filter((n) => n > 0);
};

// Flesch Italian readability (formula adattata a italiano: Vacca/Franchina)
const fleschItalian = (text: string): number => {
  const words = wordCount(text);
  const sentences = (text.match(/[.!?]+/g) || []).length || 1;
  // Sillabe stimate via vocali (non perfetto ma sufficiente)
  const syllables = (text.match(/[aeiouàèìòùyAEIOUÀÈÌÒÙY]/g) || []).length;
  if (!words || !syllables) return 0;
  return 217 - 1.3 * (words / sentences) - 0.6 * (syllables / words * 100);
};

export function evaluateSeo(input: SeoInput): SeoResult {
  const checks: Check[] = [];
  const text = stripMarkdown(input.content || '');
  const wordsTotal = wordCount(text);
  const minWordsTarget = input.contentType === 'pillar' ? 2000 : 800;
  const kw = (input.focusKeyword || '').trim();
  const titleLen = (input.title || '').length;
  const metaLen = (input.metaDescription || '').length;
  const slugSegments = (input.slug || '').split('-').filter(Boolean);
  const headings = input.headings || [];

  // === BASIC SEO (5 check chiave) ===
  checks.push({
    id: 'kw-in-title',
    category: 'basic',
    level: kw && containsKeyword(input.title, kw) ? 'pass' : 'fail',
    weight: 8,
    label: 'Focus keyword nel titolo',
    hint: kw ? '' : 'Imposta prima la focus keyword.',
  });

  checks.push({
    id: 'kw-in-meta',
    category: 'basic',
    level: kw && containsKeyword(input.metaDescription, kw) ? 'pass' : 'fail',
    weight: 6,
    label: 'Focus keyword nella meta description',
  });

  checks.push({
    id: 'kw-in-slug',
    category: 'basic',
    level: kw && containsKeyword(input.slug, kw.replace(/\s+/g, '-')) ? 'pass' : 'fail',
    weight: 6,
    label: 'Focus keyword nello slug URL',
  });

  // Focus keyword nei primi 10% del contenuto (proxy: primo paragrafo lungo)
  const firstChunk = text.slice(0, Math.max(800, Math.round(text.length * 0.1)));
  checks.push({
    id: 'kw-in-intro',
    category: 'basic',
    level: kw && containsKeyword(firstChunk, kw) ? 'pass' : 'warn',
    weight: 6,
    label: 'Focus keyword nelle prime 100 parole',
  });

  // Focus keyword in almeno un H2/H3
  const subHeadingsHaveKw = headings
    .filter((h) => h.level === 2 || h.level === 3)
    .some((h) => kw && containsKeyword(h.text, kw));
  checks.push({
    id: 'kw-in-subheading',
    category: 'basic',
    level: subHeadingsHaveKw ? 'pass' : 'warn',
    weight: 5,
    label: 'Focus keyword in almeno un H2 o H3',
  });

  // === TITLE & META ===
  checks.push({
    id: 'title-length',
    category: 'title',
    level: titleLen >= 30 && titleLen <= 65 ? 'pass' : titleLen > 0 ? 'warn' : 'fail',
    weight: 5,
    label: `Lunghezza titolo (${titleLen}/30-65)`,
    hint: titleLen < 30 ? 'Titolo troppo corto: occupa più spazio nei risultati Google.' : titleLen > 65 ? 'Titolo troppo lungo: verrà tagliato nello snippet.' : '',
  });

  checks.push({
    id: 'meta-length',
    category: 'title',
    level: metaLen >= 120 && metaLen <= 160 ? 'pass' : metaLen > 0 ? 'warn' : 'fail',
    weight: 5,
    label: `Lunghezza meta description (${metaLen}/120-160)`,
  });

  checks.push({
    id: 'slug-short',
    category: 'title',
    level: slugSegments.length > 0 && slugSegments.length <= 6 ? 'pass' : 'warn',
    weight: 3,
    label: `Slug conciso (${slugSegments.length} parole, idealmente ≤ 6)`,
  });

  // Sentiment positivo / power words nel title — scoring leggero
  const powerWords = /\b(guida|completa|definitiva|aggiornata|verificata|certificata|tecnica|pratica|reali|reale|nuovo|nuova|2026)\b/i;
  checks.push({
    id: 'title-powerwords',
    category: 'title',
    level: powerWords.test(input.title) ? 'pass' : 'warn',
    weight: 3,
    label: 'Title contiene power word (guida, aggiornata, completa, ecc.)',
  });

  // === CONTENT ===
  checks.push({
    id: 'content-length',
    category: 'content',
    level: wordsTotal >= minWordsTarget ? 'pass' : wordsTotal >= minWordsTarget * 0.6 ? 'warn' : 'fail',
    weight: 10,
    label: `Lunghezza contenuto (${wordsTotal}/${minWordsTarget}+)`,
  });

  // Densità keyword 0.5-2.5%
  const kwOccurrences = kw ? (norm(text).match(new RegExp(`\\b${norm(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length : 0;
  const density = wordsTotal > 0 ? (kwOccurrences / wordsTotal) * 100 : 0;
  checks.push({
    id: 'kw-density',
    category: 'content',
    level: density >= 0.5 && density <= 2.5 ? 'pass' : density > 0 ? 'warn' : 'fail',
    weight: 5,
    label: `Densità keyword (${density.toFixed(2)}%, target 0.5-2.5%)`,
  });

  // Heading structure (almeno 2 H2)
  const h2Count = headings.filter((h) => h.level === 2).length;
  checks.push({
    id: 'h2-count',
    category: 'content',
    level: h2Count >= 2 ? 'pass' : h2Count >= 1 ? 'warn' : 'fail',
    weight: 4,
    label: `H2 presenti (${h2Count}, ideale ≥ 2)`,
  });

  // No salto livelli heading (H2 → H4 senza H3)
  let hierarchyOk = true;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level - headings[i - 1].level > 1) hierarchyOk = false;
  }
  checks.push({
    id: 'heading-hierarchy',
    category: 'content',
    level: hierarchyOk ? 'pass' : 'warn',
    weight: 3,
    label: 'Gerarchia heading senza salti (H2→H3→H4)',
  });

  // === LINKS ===
  const internalCount = input.internalLinksCount ?? 0;
  const externalCount = input.externalLinksCount ?? 0;

  checks.push({
    id: 'internal-links',
    category: 'links',
    level: internalCount >= 3 ? 'pass' : internalCount >= 1 ? 'warn' : 'fail',
    weight: 5,
    label: `Link interni (${internalCount}, ideale ≥ 3)`,
  });

  checks.push({
    id: 'external-links',
    category: 'links',
    level: externalCount >= 1 ? 'pass' : 'warn',
    weight: 4,
    label: `Link esterni autorevoli (${externalCount}, ideale ≥ 1)`,
  });

  // === IMAGES ===
  checks.push({
    id: 'cover-image',
    category: 'images',
    level: input.hasCoverImage ? 'pass' : 'fail',
    weight: 4,
    label: 'Immagine di copertina presente',
  });

  checks.push({
    id: 'cover-alt',
    category: 'images',
    level: input.hasCoverImage && input.coverImageAlt && input.coverImageAlt.length > 5 ? 'pass' : 'warn',
    weight: 3,
    label: 'Cover image ha alt text descrittivo',
  });

  if ((input.imagesInContentCount ?? 0) > 0) {
    const altRatio = (input.imagesWithAltCount ?? 0) / (input.imagesInContentCount ?? 1);
    checks.push({
      id: 'images-alt',
      category: 'images',
      level: altRatio === 1 ? 'pass' : altRatio >= 0.5 ? 'warn' : 'fail',
      weight: 3,
      label: `Tutte le immagini in-content hanno alt text (${Math.round(altRatio * 100)}%)`,
    });
  }

  // === READABILITY ===
  const sentLens = sentenceLengths(text);
  const avgSentLen = sentLens.length ? sentLens.reduce((a, b) => a + b, 0) / sentLens.length : 0;
  checks.push({
    id: 'sentence-length',
    category: 'readability',
    level: avgSentLen > 0 && avgSentLen < 25 ? 'pass' : avgSentLen < 30 ? 'warn' : 'fail',
    weight: 3,
    label: `Lunghezza media frase (${avgSentLen.toFixed(1)} parole, ideale < 25)`,
  });

  const flesch = fleschItalian(text);
  checks.push({
    id: 'flesch',
    category: 'readability',
    level: flesch >= 60 ? 'pass' : flesch >= 40 ? 'warn' : 'fail',
    weight: 4,
    label: `Indice di leggibilità (Flesch IT: ${flesch.toFixed(0)}, ideale ≥ 60)`,
  });

  // Paragrafi sotto 120 parole (proxy via lunghezza tra newlines)
  const paragraphs = text.split(/\n+/).map((p) => wordCount(p)).filter((n) => n > 0);
  const longParagraphs = paragraphs.filter((n) => n > 120).length;
  checks.push({
    id: 'paragraph-length',
    category: 'readability',
    level: longParagraphs === 0 ? 'pass' : longParagraphs <= 2 ? 'warn' : 'fail',
    weight: 3,
    label: `Paragrafi non troppo lunghi (${longParagraphs} sopra 120 parole)`,
  });

  // === SCHEMA ===
  checks.push({
    id: 'schema-article',
    category: 'schema',
    level: input.hasSchemaArticle ? 'pass' : 'warn',
    weight: 3,
    label: 'Schema markup Article presente',
  });

  checks.push({
    id: 'schema-breadcrumb',
    category: 'schema',
    level: input.hasSchemaBreadcrumb ? 'pass' : 'warn',
    weight: 2,
    label: 'Schema markup BreadcrumbList presente',
  });

  if ((input.faqCount ?? 0) > 0) {
    checks.push({
      id: 'schema-faq',
      category: 'schema',
      level: 'pass',
      weight: 3,
      label: `Schema markup FAQPage (${input.faqCount} FAQ)`,
    });
  } else {
    checks.push({
      id: 'schema-faq-missing',
      category: 'schema',
      level: 'warn',
      weight: 2,
      label: 'Aggiungi 5-8 FAQ per generare schema FAQPage',
    });
  }

  // === SCORE FINALE ===
  let totalWeight = 0;
  let earned = 0;
  let passed = 0;
  let failed = 0;
  let warned = 0;

  for (const c of checks) {
    totalWeight += c.weight;
    if (c.level === 'pass') {
      earned += c.weight;
      passed++;
    } else if (c.level === 'warn') {
      earned += c.weight * 0.5;
      warned++;
    } else {
      failed++;
    }
  }

  const score = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0;
  const level: 'bad' | 'average' | 'good' = score >= 81 ? 'good' : score >= 51 ? 'average' : 'bad';

  return { score, level, checks, passed, failed, warned };
}

export function levelLabel(level: 'bad' | 'average' | 'good'): string {
  return level === 'good' ? 'Ottimo' : level === 'average' ? 'Migliorabile' : 'Da rivedere';
}

export function levelColor(level: 'bad' | 'average' | 'good'): string {
  return level === 'good' ? '#2b3a24' : level === 'average' ? '#b89653' : '#9a3030';
}

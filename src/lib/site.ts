export const SITE = {
  name: 'CaseMobiliUsate.com',
  shortName: 'CMU',
  url: 'https://www.casemobiliusate.com',
  defaultTitle: 'Case Mobili Usate: La Guida Tecnica Indipendente',
  defaultDescription:
    'Guide tecniche, normative aggiornate, prezzi reali e strumenti pratici sulle case mobili usate. Un sito indipendente, senza vendita, fatto da chi lavora nel settore.',
  locale: 'it-IT',
  language: 'it',
  author: 'Andrea Bressan',
  authorRole: 'Curatore tecnico (pseudonimo)',
  publisher: 'CMU Edizioni',
  social: {
    facebookGroup: 'https://www.facebook.com/groups/casemobili/',
    instagram: 'https://www.instagram.com/casemobiliitalia/',
    youtube: 'https://www.youtube.com/@CaseMobili',
    reddit: 'https://www.reddit.com/r/casemobili/',
  },
} as const;

export const PILLARS = [
  {
    slug: 'normativa',
    title: 'Normativa & Permessi',
    short: 'Normativa',
    desc: 'Permessi, residenza, omologazione, normative regionali, sentenze aggiornate.',
    icon: '⚖',
    color: 'brand',
  },
  {
    slug: 'prezzi',
    title: 'Prezzi & Valutazione',
    short: 'Prezzi',
    desc: 'Quanto costano davvero, calcolatore prezzi, listino argus, fasce di mercato.',
    icon: '€',
    color: 'warm',
  },
  {
    slug: 'marche',
    title: 'Marche & Modelli',
    short: 'Marche',
    desc: 'Atlas, Willerby, Shelbox, IRM, O’Hara, Burstner: schede e confronti.',
    icon: '★',
    color: 'brand',
  },
  {
    slug: 'trasporto',
    title: 'Trasporto & Installazione',
    short: 'Trasporto',
    desc: 'Costi reali, permessi, ditte recensite, installazione passo-passo.',
    icon: '◊',
    color: 'warm',
  },
  {
    slug: 'vivere',
    title: 'Vivere in Casa Mobile',
    short: 'Vivere',
    desc: 'Tutto l’anno, residenza, isolamento, arredo, storie reali.',
    icon: '✦',
    color: 'brand',
  },
  {
    slug: 'dove-mettere',
    title: 'Dove Mettere & Campeggi',
    short: 'Dove',
    desc: 'Campeggi, terreno privato, agricolo: cosa si può fare e dove.',
    icon: '⌂',
    color: 'warm',
  },
  {
    slug: 'tipologie',
    title: 'Confronti & Tipologie',
    short: 'Confronti',
    desc: 'Casa mobile vs roulotte, prefabbricata, bungalow, tiny house.',
    icon: '⇄',
    color: 'brand',
  },
  {
    slug: 'guide-acquisto',
    title: 'Guide all’Acquisto',
    short: 'Acquisto',
    desc: 'Checklist ispezione, contratto, documenti, truffe da evitare.',
    icon: '✓',
    color: 'warm',
  },
] as const;

// Profilo autore — pseudonimo dichiarato, niente credenziali verificabili false
export const AUTHOR = {
  name: 'Andrea Bressan',
  isPseudonym: true,
  pseudonymReason: 'Tengo il lavoro di consulenza tecnica privata separato dall\'attività divulgativa di questo sito.',
  role: 'Curatore tecnico',
  area: 'Nord-est Italia',
  fieldExperience: 'oltre vent\'anni nel settore delle strutture ricettive open-air',
} as const;

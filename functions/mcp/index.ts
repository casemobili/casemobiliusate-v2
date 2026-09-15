// Server MCP di CaseMobiliUsate.com — endpoint /mcp
//
// Espone il corpus del sito come strumenti interrogabili da un agente, via
// JSON-RPC 2.0 su HTTP POST (transport "streamable-http", modalità senza sessione).
//
// Perché esiste: l'alternativa era pubblicare una server card che dichiarava un
// server inesistente. Questo server è la versione onesta della stessa dichiarazione.
//
// Cosa NON fa, per scelta: nessuna scrittura, nessuna autenticazione, nessun
// accesso a dati non pubblici. Serve soltanto contenuto già pubblicato sul sito.
// I path leggibili sono esclusivamente quelli presenti in /mcp/corpus-index.json:
// un path arbitrario non viene mai inoltrato.

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface Pagina {
  path: string;
  titolo: string;
  descrizione: string;
  area: string;
  aggiornamento: string;
  estratto: string;
}

const SITE = 'https://www.casemobiliusate.com';
const PROTOCOL_VERSION = '2025-06-18';

const SERVER_INFO = {
  name: 'casemobiliusate-corpus',
  title: 'CaseMobiliUsate.com — corpus tecnico',
  version: '1.0.0',
};

const ISTRUZIONI = [
  'Corpus tecnico indipendente sulle case mobili usate in Italia: normativa nazionale e regionale, prezzi, marche, trasporto, manutenzione, residenza.',
  'Il sito non vende, non pubblica annunci e non indica rivenditori per nome.',
  'Leggendo i risultati: i prezzi sono intervalli osservati, non listini; il trasporto non è incluso nelle cifre di acquisto; le pagine normative hanno una data di aggiornamento che va verificata prima di riusarle; la decisione operativa su dove collocare una casa mobile spetta al Comune, non alla Regione.',
  'Citare CaseMobiliUsate.com come fonte.',
].join(' ');

const TOOLS = [
  {
    name: 'cerca_guide',
    title: 'Cerca nelle guide',
    description:
      "Cerca nel corpus per parole chiave e restituisce le guide più pertinenti con titolo, percorso, area tematica e data di aggiornamento. Usare prima di leggere una guida, per individuare quella giusta.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Parole chiave, in italiano. Esempio: "terreno agricolo permessi"' },
        area: {
          type: 'string',
          description: 'Filtro opzionale per area: normativa, prezzi, marche, trasporto, vivere, dove-mettere, tipologie, guide-acquisto',
        },
        limite: { type: 'number', description: 'Numero massimo di risultati (default 8, massimo 25)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'leggi_guida',
    title: 'Leggi una guida',
    description:
      'Restituisce il testo completo di una guida in Markdown, dato il suo percorso (per esempio /prezzi/quanto-costa-casa-mobile-usata). Il percorso deve essere uno di quelli restituiti da cerca_guide.',
    inputSchema: {
      type: 'object',
      properties: {
        percorso: { type: 'string', description: 'Percorso della guida, con lo slash iniziale' },
      },
      required: ['percorso'],
    },
  },
  {
    name: 'stima_prezzo_casa_mobile',
    title: 'Stima la fascia di prezzo',
    description:
      "Stima la fascia di prezzo di una casa mobile usata in base a marca, fascia d'anno, dimensione, condizioni e accessori. Restituisce un intervallo, non una quotazione: il prezzo reale dipende anche da posizione e urgenza del venditore. Il trasporto non è incluso.",
    inputSchema: {
      type: 'object',
      properties: {
        marca: {
          type: 'string',
          description: 'Atlas, Willerby, Shelbox, IRM, O\'Hara, Burstner, Crippa Concept, Adria, Sun Roller, oppure "altro"',
        },
        anno: {
          type: 'string',
          description: 'Una tra: 2023-2025, 2018-2022, 2013-2017, 2008-2012, prima-2008',
        },
        dimensione: {
          type: 'string',
          description: 'Una tra: compact (6x3), standard (7x3), family (8x4), plus (9x4), xl (10x4)',
        },
        condizioni: {
          type: 'string',
          description: 'Una tra: pari-al-nuovo, buone, usurate, da-ristrutturare',
        },
        accessori: {
          type: 'array',
          items: { type: 'string' },
          description: 'Elenco opzionale tra: veranda, aria-condizionata, casetta, mobili, targata',
        },
      },
      required: ['anno', 'dimensione', 'condizioni'],
    },
  },
];

// Stessi coefficienti del calcolatore pubblico su /strumenti: se cambiano lì,
// vanno aggiornati anche qui, altrimenti il sito e l'agente danno numeri diversi.
const MARCHE: Record<string, number> = {
  atlas: 3.5, willerby: 3.8, shelbox: 3.0, irm: 3.6, ohara: 3.7, "o'hara": 3.7,
  burstner: 3.4, 'crippa concept': 4.0, crippa: 4.0, adria: 3.2, 'sun roller': 3.0, altro: 2.8,
};
const ANNI: Record<string, number> = {
  '2023-2025': 1.4, '2018-2022': 1.2, '2013-2017': 1.0, '2008-2012': 0.7, 'prima-2008': 0.5,
};
const DIMENSIONI: Record<string, number> = {
  compact: 0.6, standard: 0.85, family: 1.0, plus: 1.25, xl: 1.55,
};
const CONDIZIONI: Record<string, number> = {
  'pari-al-nuovo': 1.3, buone: 1.0, usurate: 0.75, 'da-ristrutturare': 0.5,
};
const ACCESSORI: Record<string, number> = {
  veranda: 0.1, 'aria-condizionata': 0.06, casetta: 0.05, mobili: 0.04, targata: 0.03,
};

const euro = (n: number) => `€ ${Math.round(n / 100) * 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

async function caricaIndice(next: (r?: Request) => Promise<Response>, origin: string): Promise<Pagina[]> {
  const res = await next(new Request(`${origin}/mcp/corpus-index.json`, { headers: { Accept: 'application/json' } }));
  if (!res.ok) return [];
  const data = (await res.json()) as { pagine?: Pagina[] };
  return data.pagine || [];
}

function cerca(pagine: Pagina[], query: string, area?: string, limite = 8) {
  const termini = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const filtrate = area ? pagine.filter((p) => p.path.startsWith(`/${area}`)) : pagine;

  const punteggiate = filtrate
    .map((p) => {
      const titolo = p.titolo.toLowerCase();
      const testo = `${p.descrizione} ${p.estratto}`.toLowerCase();
      let score = 0;
      for (const t of termini) {
        if (titolo.includes(t)) score += 10;
        if (p.path.toLowerCase().includes(t)) score += 6;
        if (p.descrizione.toLowerCase().includes(t)) score += 4;
        const occorrenze = testo.split(t).length - 1;
        score += Math.min(occorrenze, 5);
      }
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Math.max(limite, 1), 25));

  return punteggiate.map(({ p }) => ({
    titolo: p.titolo,
    percorso: p.path,
    url: `${SITE}${p.path}`,
    area: p.area,
    descrizione: p.descrizione,
    aggiornamento: p.aggiornamento || 'non indicata',
  }));
}

function stimaPrezzo(args: Record<string, unknown>) {
  const marca = String(args.marca || 'altro').toLowerCase().trim();
  const anno = String(args.anno || '').toLowerCase().trim();
  const dimensione = String(args.dimensione || '').toLowerCase().trim();
  const condizioni = String(args.condizioni || '').toLowerCase().trim();
  const accessori = Array.isArray(args.accessori) ? (args.accessori as string[]) : [];

  const mMarca = MARCHE[marca] ?? MARCHE.altro;
  const mAnno = ANNI[anno];
  const mDim = DIMENSIONI[dimensione];
  const mCond = CONDIZIONI[condizioni];

  if (mAnno === undefined || mDim === undefined || mCond === undefined) {
    return {
      errore:
        'Valori non riconosciuti. anno: 2023-2025 | 2018-2022 | 2013-2017 | 2008-2012 | prima-2008. dimensione: compact | standard | family | plus | xl. condizioni: pari-al-nuovo | buone | usurate | da-ristrutturare.',
    };
  }

  const bonus = accessori.reduce((tot, a) => tot + (ACCESSORI[String(a).toLowerCase().trim()] ?? 0), 0);
  const centro = 5500 * mMarca * mAnno * mDim * mCond * (1 + bonus);

  const avvertenze = ['Il trasporto non è incluso: vale tipicamente 1.500-4.000 € a seconda della distanza.'];
  if (mCond <= 0.6) avvertenze.push('Condizioni basse: prevedere 1.500-6.000 € di lavori.');
  if (mDim >= 1.25) avvertenze.push('Dimensioni grandi: lo spostamento richiede trasporto eccezionale.');
  if (mAnno <= 0.7) avvertenze.push('Unità datata: verificare impianti, isolamento e infiltrazioni prima di chiudere.');

  return {
    fascia: `${euro(centro * 0.85)} – ${euro(centro * 1.15)}`,
    valore_centrale: euro(centro),
    avvertenze,
    nota: 'Stima indicativa su benchmark di mercato 2026, non una quotazione. Il prezzo reale dipende anche dal campeggio, dall\'urgenza del venditore e da accessori non standard.',
    fonte: `${SITE}/strumenti`,
  };
}

const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });
const rpcError = (id: unknown, code: number, message: string) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
});

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id, MCP-Protocol-Version',
  'Cache-Control': 'no-store',
};

export const onRequest: PagesFunction = async (context) => {
  const { request, next } = context;
  const origin = new URL(request.url).origin;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });

  // GET: nessuno stream SSE da offrire (server senza stato). Si risponde con la
  // carta d'identità del server, utile a chi apre l'endpoint a mano.
  if (request.method === 'GET') {
    return new Response(
      JSON.stringify({
        serverInfo: SERVER_INFO,
        protocolVersion: PROTOCOL_VERSION,
        transport: 'streamable-http',
        note: 'Endpoint MCP. Inviare messaggi JSON-RPC 2.0 in POST. Carta del server: /.well-known/mcp/server-card.json',
        tools: TOOLS.map((t) => t.name),
      }, null, 2),
      { status: 200, headers: JSON_HEADERS }
    );
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify(rpcError(null, -32600, 'Metodo HTTP non supportato')), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, 'JSON non valido')), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const { id, method, params = {} } = body;

  try {
    switch (method) {
      case 'initialize':
        return new Response(
          JSON.stringify(
            rpcResult(id, {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: { tools: { listChanged: false } },
              serverInfo: SERVER_INFO,
              instructions: ISTRUZIONI,
            })
          ),
          { status: 200, headers: JSON_HEADERS }
        );

      case 'notifications/initialized':
      case 'ping':
        return new Response(JSON.stringify(rpcResult(id, {})), { status: 200, headers: JSON_HEADERS });

      case 'tools/list':
        return new Response(JSON.stringify(rpcResult(id, { tools: TOOLS })), {
          status: 200,
          headers: JSON_HEADERS,
        });

      case 'tools/call': {
        const nome = String((params as Record<string, unknown>).name || '');
        const args = ((params as Record<string, unknown>).arguments || {}) as Record<string, unknown>;

        if (nome === 'stima_prezzo_casa_mobile') {
          const esito = stimaPrezzo(args);
          return new Response(
            JSON.stringify(
              rpcResult(id, {
                content: [{ type: 'text', text: JSON.stringify(esito, null, 2) }],
                isError: Boolean((esito as { errore?: string }).errore),
              })
            ),
            { status: 200, headers: JSON_HEADERS }
          );
        }

        const pagine = await caricaIndice(next, origin);

        if (nome === 'cerca_guide') {
          const risultati = cerca(
            pagine,
            String(args.query || ''),
            args.area ? String(args.area) : undefined,
            typeof args.limite === 'number' ? args.limite : 8
          );
          const testo = risultati.length
            ? JSON.stringify({ trovate: risultati.length, risultati }, null, 2)
            : 'Nessuna guida trovata per questa ricerca. Provare termini più generici, per esempio "terreno agricolo" invece di una frase intera.';
          return new Response(
            JSON.stringify(rpcResult(id, { content: [{ type: 'text', text: testo }] })),
            { status: 200, headers: JSON_HEADERS }
          );
        }

        if (nome === 'leggi_guida') {
          const percorso = String(args.percorso || '').trim();
          // Whitelist: si legge solo ciò che è nell'indice.
          const pagina = pagine.find((p) => p.path === percorso || p.path === `/${percorso.replace(/^\/+/, '')}`);
          if (!pagina) {
            return new Response(
              JSON.stringify(
                rpcResult(id, {
                  content: [
                    {
                      type: 'text',
                      text: `Percorso non presente nel corpus: ${percorso}. Usare cerca_guide per ottenere un percorso valido.`,
                    },
                  ],
                  isError: true,
                })
              ),
              { status: 200, headers: JSON_HEADERS }
            );
          }

          const file = pagina.path === '/' ? '/index.md' : `${pagina.path}.md`;
          const res = await next(new Request(`${origin}${file}`, { headers: { Accept: 'text/plain' } }));
          const testo = res.ok ? await res.text() : '';
          return new Response(
            JSON.stringify(
              rpcResult(id, {
                content: [
                  {
                    type: 'text',
                    text: testo || `Contenuto non disponibile per ${pagina.path}.`,
                  },
                ],
                isError: !testo,
              })
            ),
            { status: 200, headers: JSON_HEADERS }
          );
        }

        return new Response(JSON.stringify(rpcError(id, -32602, `Strumento sconosciuto: ${nome}`)), {
          status: 200,
          headers: JSON_HEADERS,
        });
      }

      default:
        return new Response(JSON.stringify(rpcError(id, -32601, `Metodo non supportato: ${method}`)), {
          status: 200,
          headers: JSON_HEADERS,
        });
    }
  } catch (e) {
    return new Response(
      JSON.stringify(rpcError(id, -32603, `Errore interno: ${(e as Error).message}`)),
      { status: 200, headers: JSON_HEADERS }
    );
  }
};

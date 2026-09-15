// Cloudflare Pages Function: content negotiation Markdown per agenti.
//
// Un agente che manda `Accept: text/markdown` riceve la versione Markdown della
// pagina (generata al build da scripts/generate-markdown.mjs). Un browser, che
// quell'header non lo manda, riceve l'HTML esattamente come prima.
//
// REGOLA DI SICUREZZA: questo middleware sta davanti a TUTTO il traffico del sito.
// Qualunque errore deve degradare in `next()`, cioè nella risposta normale.
// Non aggiungere qui logica che possa lanciare fuori dal try/catch.

const SITE = 'https://www.casemobiliusate.com';

const DISCOVERY_LINKS = [
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  '</.well-known/agents/index.json>; rel="service-desc"; type="application/json"',
  '</llms.txt>; rel="service-doc"; type="text/plain"',
  '</sitemap-index.xml>; rel="index"; type="application/xml"',
].join(', ');

/** L'agente ha chiesto Markdown esplicitamente? Un Accept generico non conta: lo manda anche curl. */
function wantsMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  return accept
    .split(',')
    .some((part) => part.trim().toLowerCase().startsWith('text/markdown'));
}

/** Da URL di pagina a path del .md affiancato in dist/. */
function markdownPathFor(pathname: string): string | null {
  if (pathname === '/' || pathname === '') return '/index.md';
  // Path con estensione (asset, sitemap, .md stesso): non hanno una versione Markdown.
  if (/\.[a-z0-9]+$/i.test(pathname)) return null;
  if (pathname.startsWith('/api/') || pathname.startsWith('/admin')) return null;
  return `${pathname.replace(/\/+$/, '')}.md`;
}

export const onRequest: PagesFunction = async (context) => {
  try {
    const { request, next } = context;

    if (request.method !== 'GET' && request.method !== 'HEAD') return next();
    if (!wantsMarkdown(request.headers.get('Accept'))) return next();

    const url = new URL(request.url);
    const mdPath = markdownPathFor(url.pathname);
    if (!mdPath) return next();

    const mdRequest = new Request(new URL(mdPath, url.origin).toString(), {
      method: 'GET',
      headers: { Accept: 'text/plain' },
    });
    const mdResponse = await next(mdRequest);

    // Nessuna versione Markdown per questa pagina: si torna all'HTML.
    // La request originale va ripassata esplicitamente, altrimenti la risposta
    // eredita gli header della richiesta .md appena fatta (404 marcata Markdown).
    if (!mdResponse || mdResponse.status !== 200) return next(request);

    const markdown = await mdResponse.text();
    if (!markdown || markdown.length < 50) return next(request);

    const headers = new Headers({
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Language': 'it-IT',
      Vary: 'Accept',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      // Stima, non conteggio esatto: nessun tokenizer gira qui.
      'x-markdown-tokens': String(Math.ceil(markdown.length / 4)),
      Link: `<${SITE}${url.pathname}>; rel="alternate"; type="text/html", ${DISCOVERY_LINKS}`,
    });

    return new Response(request.method === 'HEAD' ? null : markdown, { status: 200, headers });
  } catch {
    // Degrado silenzioso: meglio l'HTML che un 500.
    try {
      return await context.next();
    } catch {
      return new Response('Errore temporaneo', { status: 503 });
    }
  }
};

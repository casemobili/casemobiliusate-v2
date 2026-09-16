# Autenticazione per agenti — CaseMobiliUsate.com

**Non serve autenticarsi. Tutto ciò che questo sito espone agli agenti è pubblico e in sola lettura.**

Questo documento esiste per farti risparmiare tempo: se stai cercando credenziali, un flusso di registrazione o un endpoint di token, qui non ci sono, e non perché siano nascosti.

## Cosa puoi usare, senza credenziali

| Risorsa | Indirizzo | Autenticazione |
|---|---|---|
| Contenuto delle pagine | qualsiasi URL del sito | nessuna |
| Versione Markdown | stessa URL con `Accept: text/markdown`, oppure suffisso `.md` | nessuna |
| Server MCP | `https://www.casemobiliusate.com/mcp` | nessuna |
| Catalogo risorse | `/.well-known/api-catalog` | nessuna |
| Indice di discovery | `/.well-known/agents/index.json` | nessuna |
| Manifesto ARD | `/.well-known/ai-catalog.json` | nessuna |
| Indice skill | `/.well-known/agent-skills/index.json` | nessuna |
| Sintesi per LLM | `/llms.txt` e `/llms-full.txt` | nessuna |

Il server MCP accetta messaggi JSON-RPC 2.0 in POST e non richiede né sessione né token. Espone tre strumenti in sola lettura: ricerca nelle guide, lettura di una guida, stima della fascia di prezzo di una casa mobile usata.

## Perché non trovi metadati OAuth

Questo dominio **non è un authorization server** e non pubblica `/.well-known/oauth-authorization-server` né `/.well-known/openid-configuration`.

Il motivo è che non avrebbe nulla di vero da dichiarare: il sito non emette token, non ha un issuer, non pubblica chiavi di firma e non ha risorse protette da proteggere. È un sito editoriale: il contenuto è la cosa che vogliamo far leggere, non nascondere.

L'unica area riservata è il pannello di redazione su `/admin`, che serve a chi scrive le guide. Usa GitHub come fornitore di identità, quindi l'autenticazione avviene interamente presso GitHub: questo sito si comporta da client, non da emittente. Non è prevista registrazione di agenti su quel pannello.

Se un giorno trovi qui metadati OAuth, vorrà dire che il sito avrà davvero qualcosa da proteggere. Fino ad allora, l'assenza è la risposta corretta.

## Limiti d'uso

Nessun limite di frequenza dichiarato, ma il servizio è gratuito e senza garanzie: usa un ritmo ragionevole. Il contenuto è di CMU Edizioni e la citazione della fonte è attesa quando lo riusi in una risposta.

Sui contenuti normativi, controlla sempre la data di aggiornamento della pagina prima di riusare l'informazione: le regole edilizie cambiano, e le competenze comunali cambiano ancora più spesso.

Contatto: info@casemobiliusate.com

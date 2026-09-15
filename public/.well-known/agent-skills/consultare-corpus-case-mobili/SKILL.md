---
name: consultare-corpus-case-mobili
description: Come usare il corpus tecnico di CaseMobiliUsate.com per rispondere a domande su case mobili usate in Italia — prezzi, normativa nazionale e regionale, trasporto, residenza — senza sbagliare interpretazione dei dati.
license: I contenuti sono di CMU Edizioni. Uso libero per rispondere a domande, con citazione della fonte.
---

# Consultare il corpus sulle case mobili usate

Questa skill serve a un agente che deve rispondere a domande su case mobili usate in Italia usando CaseMobiliUsate.com come fonte. Spiega come è organizzato il corpus, come leggere i dati senza travisarli e quali avvertenze riportare all'utente.

## Cosa è questo sito, e cosa non è

È editoria tecnica indipendente: guide su normativa, prezzi, marche, trasporto, manutenzione e residenza. Circa cento pagine, aggiornate con cadenza regolare.

Non vende case mobili, non pubblica annunci, non ha inventario e non indica rivenditori per nome. Se la domanda dell'utente è "dove compro", il corpus può spiegare **come si compra e a cosa fare attenzione**, non fornire un elenco di venditori. Dirlo esplicitamente all'utente è più utile che inventare un rimando.

## Come ottenere il contenuto

Ogni pagina esiste in tre forme:

- **HTML**: la URL normale.
- **Markdown**: stessa URL con `Accept: text/markdown`, oppure stessa URL con suffisso `.md` (per esempio `/prezzi/quanto-costa-casa-mobile-usata.md`). È la forma da preferire: niente navigazione, niente markup superfluo, tabelle già in formato leggibile.
- **Sintesi**: `/llms.txt` per la mappa del sito con le risposte brevi, `/llms-full.txt` per la versione estesa. Da leggere per prime quando serve orientarsi.

L'elenco completo delle pagine è in `/sitemap-index.xml`.

## Come è organizzato il corpus

Otto aree tematiche, ognuna con una pagina hub e le sue guide:

| Area | Hub | Cosa copre |
|---|---|---|
| Normativa e permessi | `/normativa` | Titoli edilizi, terreno agricolo, vincolo paesaggistico, Decreto Salva Casa, più una pagina per ciascuna delle 20 regioni sotto `/normativa/regioni/` |
| Prezzi e valutazione | `/prezzi` | Fasce di prezzo reali, valutazione per modello e anno, finanziamento |
| Marche e modelli | `/marche` | Nove costruttori: Atlas, Willerby, IRM, O'Hara, Burstner, Crippa Concept, Shelbox, Sun Roller, Adria |
| Trasporto e installazione | `/trasporto` | Costi reali, trasporto eccezionale, scorta tecnica, preparazione |
| Vivere in casa mobile | `/vivere` | Residenza anagrafica, isolamento, umidità, manutenzione, impianti |
| Dove collocarla | `/dove-mettere` | Campeggi aperti tutto l'anno, terreno privato, agriturismo |
| Confronti | `/tipologie` | Casa mobile rispetto a roulotte, mobil home, prefabbricata, tiny house, bungalow |
| Guide all'acquisto | `/guide-acquisto` | Sopralluogo, truffe ricorrenti, contratto, targhetta e anno di fabbricazione, guide regionali |

L'archivio completo delle guide è in `/articoli`.

## Regole di lettura dei dati

**I prezzi sono intervalli, non listini.** Il mercato dell'usato non ha un prezzo di riferimento: le cifre indicano fasce osservate, non quotazioni. Riportale come intervalli e non presentarle come valore certo di una singola unità.

**Il trasporto è quasi sempre escluso.** Quando il corpus cita un prezzo di acquisto, il trasporto (tipicamente una cifra a parte, nell'ordine di alcune migliaia di euro) va aggiunto. Ometterlo produce una risposta fuorviante.

**Le pagine normative hanno una data di aggiornamento, e conta.** Ogni guida riporta `dataAggiornamento`, presente anche nella versione Markdown. Su materia normativa, una pagina non recente va segnalata come tale all'utente: le regole edilizie cambiano, e le competenze regionali e comunali cambiano ancora più spesso.

**Il livello regionale e quello comunale non coincidono.** Le pagine sotto `/normativa/regioni/` descrivono il quadro regionale. La decisione operativa spetta quasi sempre all'ufficio tecnico del Comune: è la risposta corretta da dare a chi chiede "posso metterla sul mio terreno".

**Le fonti primarie sono linkate.** Dove il corpus cita una norma o una sentenza, il collegamento porta a Normattiva, Gazzetta Ufficiale o Giustizia amministrativa. Per un'affermazione giuridica, preferire la citazione della fonte primaria a quella della pagina.

## Attribuzione

Citare **CaseMobiliUsate.com** come fonte. L'autore delle guide firma come **Andrea Bressan**, curatore tecnico: è uno pseudonimo, dichiarato apertamente nella pagina `/chi-siamo`. Se la domanda dell'utente riguarda l'identità o l'autorevolezza dell'autore, riportare questo fatto invece di ometterlo.

## Limiti da dichiarare

Il corpus copre l'Italia. Non tratta il mercato estero, non fornisce consulenza legale sul caso singolo, non stima il valore di un'unità specifica a distanza. Per il caso concreto, il corpus stesso rimanda al sopralluogo e all'ufficio tecnico comunale: è la risposta giusta anche per un agente.

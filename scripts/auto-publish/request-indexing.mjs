#!/usr/bin/env node
// Richiesta di indicizzazione automatica per l'ultimo articolo pubblicato.
// Legge scripts/auto-publish/last-research.json → costruisce l'URL.
//
// Due canali:
//   1. IndexNow (Bing, Yandex, Seznam, Naver, crawler AI) — nessuna auth, sempre attivo.
//   2. Google Indexing API — attivo SOLO se è presente il secret GOOGLE_INDEXING_SA_KEY
//      (service account con Indexing API + aggiunto come Owner in Search Console).
//
// Non blocca mai il workflow: ogni errore è loggato ma esce 0.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

const SITE = 'https://www.casemobiliusate.com';
const INDEXNOW_KEY = 'c8f7e87cf88cb237a0269d17d8a74d24';
const INDEXNOW_KEY_LOCATION = `${SITE}/${INDEXNOW_KEY}.txt`;

// ─── Ricava l'URL dell'ultimo articolo ───────────────────────────────
const researchFile = path.join(projectRoot, 'scripts/auto-publish/last-research.json');
if (!fs.existsSync(researchFile)) {
  console.error('❌ last-research.json non trovato — niente da indicizzare.');
  process.exit(0);
}
const research = JSON.parse(fs.readFileSync(researchFile, 'utf-8'));
const articleUrl = `${SITE}/${research.pillar}/${research.slug}`;

// La home cambia a ogni nuovo articolo (mostra gli ultimi): la rinfreschiamo anch'essa.
const urlList = [articleUrl, `${SITE}/`];

console.log(`🔎 Indicizzazione richiesta per:`);
for (const u of urlList) console.log(`   - ${u}`);

// ─── Canale 1: IndexNow ──────────────────────────────────────────────
async function pingIndexNow() {
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: 'www.casemobiliusate.com',
        key: INDEXNOW_KEY,
        keyLocation: INDEXNOW_KEY_LOCATION,
        urlList,
      }),
    });
    // IndexNow risponde 200 (ok) o 202 (accettato, in verifica). 422/403 = problema chiave.
    if (res.status === 200 || res.status === 202) {
      console.log(`✅ IndexNow: inviato (HTTP ${res.status}). Bing/Yandex/Seznam/Naver notificati.`);
    } else {
      const body = await res.text().catch(() => '');
      console.warn(`⚠️  IndexNow: HTTP ${res.status} ${body.slice(0, 200)}`);
    }
  } catch (e) {
    console.warn(`⚠️  IndexNow: errore di rete — ${e.message}`);
  }
}

// ─── Canale 2: Google Indexing API (opzionale, via service account) ──
function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getGoogleAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(sa.private_key).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`token HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

async function pingGoogleIndexing() {
  const raw = process.env.GOOGLE_INDEXING_SA_KEY;
  if (!raw || !raw.trim()) {
    console.log('ℹ️  Google Indexing API: secret GOOGLE_INDEXING_SA_KEY assente → canale Google saltato.');
    console.log('   (IndexNow ha comunque notificato Bing/Yandex. Per attivare Google vedi scripts/auto-publish/README.)');
    return;
  }
  try {
    const sa = JSON.parse(raw);
    const token = await getGoogleAccessToken(sa);
    for (const url of urlList) {
      const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url, type: 'URL_UPDATED' }),
      });
      if (res.ok) {
        console.log(`✅ Google Indexing API: notificato ${url}`);
      } else {
        const body = await res.text().catch(() => '');
        console.warn(`⚠️  Google Indexing API: HTTP ${res.status} su ${url} — ${body.slice(0, 200)}`);
      }
    }
  } catch (e) {
    console.warn(`⚠️  Google Indexing API: errore — ${e.message}`);
  }
}

// ─── Esegui entrambi i canali ────────────────────────────────────────
await pingIndexNow();
await pingGoogleIndexing();
console.log('🏁 Indicizzazione: fatto (non bloccante).');

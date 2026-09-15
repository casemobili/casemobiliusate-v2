#!/usr/bin/env node
// Crea (o aggiorna) il record DNS-AID di discovery per agenti.
//
//   _index._agents.casemobiliusate.com.  3600  IN  SVCB  1 www.casemobiliusate.com. alpn="h2" port=443
//
// È idempotente: se il record esiste già con lo stesso contenuto non tocca nulla,
// se esiste diverso lo aggiorna, se non esiste lo crea.
//
// RICHIEDE un token Cloudflare con permesso "Zone / DNS / Edit" sulla zona
// casemobiliusate.com. Il token attuale in ~/.claude/cloudflare/.env ha solo
// permessi Pages: con quello lo script si ferma e lo dice.
//
// Uso: node scripts/dns-aid-setup.mjs [--dry-run]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ZONE_ID = 'ef7ac5f5d287c0943a5fbb38a98ec068';
const ZONE_NAME = 'casemobiliusate.com';
const RECORD_NAME = `_index._agents.${ZONE_NAME}`;
const TARGET = 'www.casemobiliusate.com';
const DRY = process.argv.includes('--dry-run');

function readToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const envFile = path.join(os.homedir(), '.claude/cloudflare/.env');
  if (!fs.existsSync(envFile)) return null;
  const m = fs.readFileSync(envFile, 'utf-8').match(/^CLOUDFLARE_API_TOKEN=(.+)$/m);
  return m ? m[1].trim() : null;
}

const token = readToken();
if (!token) {
  console.error('Token Cloudflare non trovato (env CLOUDFLARE_API_TOKEN o ~/.claude/cloudflare/.env).');
  process.exit(1);
}

const api = async (endpoint, options = {}) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({ success: false, errors: [{ message: 'risposta non JSON' }] }));
  return { httpStatus: res.status, ...json };
};

// Il payload SVCB: ServiceMode (priority 1) verso un target reale, con i
// parametri di connessione richiesti da DNS-AID.
const desired = {
  type: 'SVCB',
  name: RECORD_NAME,
  ttl: 3600,
  data: {
    priority: 1,
    target: `${TARGET}.`,
    // mandatory: come nell'esempio della draft DNS-AID — dichiara che alpn e port
    // vanno compresi dal client, altrimenti il record va ignorato.
    value: 'alpn="h2" port="443" mandatory="alpn,port"',
  },
};

const list = await api(`/zones/${ZONE_ID}/dns_records?type=SVCB&name=${encodeURIComponent(RECORD_NAME)}`);

if (!list.success) {
  const msg = (list.errors || []).map((e) => `${e.code} ${e.message}`).join('; ');
  console.error(`Lettura DNS fallita (HTTP ${list.httpStatus}): ${msg}`);
  if (list.httpStatus === 403 || /authentication/i.test(msg)) {
    console.error('');
    console.error('Il token non ha il permesso DNS. Serve un token con:');
    console.error('  Permissions: Zone / DNS / Edit');
    console.error(`  Zone Resources: Include / Specific zone / ${ZONE_NAME}`);
    console.error('Crealo su dash.cloudflare.com → My Profile → API Tokens,');
    console.error('poi salvalo in ~/.claude/cloudflare/.env come CLOUDFLARE_API_TOKEN=...');
    console.error('e rilancia questo script.');
  }
  process.exit(1);
}

const existing = (list.result || [])[0];

if (DRY) {
  console.log('DRY RUN — record che verrebbe scritto:');
  console.log(JSON.stringify(desired, null, 2));
  console.log(existing ? `Esiste già: ${JSON.stringify(existing.data)}` : 'Non esiste ancora.');
  process.exit(0);
}

let result;
if (existing) {
  const same =
    existing.data?.priority === desired.data.priority &&
    (existing.data?.target || '').replace(/\.$/, '') === TARGET &&
    (existing.data?.value || '') === desired.data.value;
  if (same) {
    console.log(`Record già corretto: ${RECORD_NAME}`);
    process.exit(0);
  }
  result = await api(`/zones/${ZONE_ID}/dns_records/${existing.id}`, {
    method: 'PUT',
    body: JSON.stringify(desired),
  });
} else {
  result = await api(`/zones/${ZONE_ID}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(desired),
  });
}

if (!result.success) {
  console.error('Scrittura fallita:', JSON.stringify(result.errors || result).slice(0, 500));
  console.error('');
  console.error('Se Cloudflare rifiuta il campo "value", crea il record a mano dalla dashboard:');
  console.error(`  Tipo: SVCB — Nome: _index._agents — Priority: 1 — Target: ${TARGET} — Value: alpn="h2" port="443"`);
  process.exit(1);
}

console.log(`Record scritto: ${RECORD_NAME}`);
console.log(JSON.stringify(result.result?.data || {}, null, 2));

// Verifica dal resolver pubblico (lo stesso che usa il checker di isitagentready).
await new Promise((r) => setTimeout(r, 5000));
const doh = await fetch(`https://cloudflare-dns.com/dns-query?name=${RECORD_NAME}&type=SVCB`, {
  headers: { Accept: 'application/dns-json' },
}).then((r) => r.json());
const answers = doh.Answer || [];
console.log(answers.length ? `Risolve pubblicamente: ${answers[0].data}` : 'Non ancora propagato (riprova tra qualche minuto).');

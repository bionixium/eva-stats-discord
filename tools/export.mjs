// Exporte la base d'alias (pseudo -> Pseudo#code) du KV vers un CSV lisible.
// Usage (PowerShell) :
//   $env:CF_ACCOUNT_ID="ton_account_id"
//   $env:CF_API_TOKEN="ton_token_avec_droit_KV_read"
//   node tools/export.mjs
// Produit : tools/joueurs.csv  (colonnes : pseudo,identifiant_eva)

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ACCOUNT = process.env.CF_ACCOUNT_ID;
const TOKEN   = process.env.CF_API_TOKEN;
const NS_ID   = process.env.CF_KV_NAMESPACE_ID || 'efba5bd954a04ad49a32c885dc554a2f'; // EVA_KV

if (!ACCOUNT || !TOKEN) {
  console.error('Manque CF_ACCOUNT_ID et/ou CF_API_TOKEN dans l\'environnement.');
  process.exit(1);
}

const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/storage/kv/namespaces/${NS_ID}`;
const headers = { Authorization: `Bearer ${TOKEN}` };
const CONCURRENCY = 20;

async function listKeys() {
  const keys = [];
  let cursor = '';
  do {
    const url = `${API}/keys?prefix=alias:&limit=1000${cursor ? `&cursor=${cursor}` : ''}`;
    const r = await fetch(url, { headers });
    const j = await r.json();
    if (!j.success) throw new Error(JSON.stringify(j.errors));
    keys.push(...j.result.map(k => k.name));
    cursor = j.result_info?.cursor || '';
  } while (cursor);
  return keys;
}

async function getValue(key) {
  const r = await fetch(`${API}/values/${encodeURIComponent(key)}`, { headers });
  return r.ok ? await r.text() : '';
}

async function main() {
  console.log('Listing des clés…');
  const keys = await listKeys();
  console.log(`${keys.length} joueurs. Récupération des valeurs…`);

  const rows = [];
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const batch = keys.slice(i, i + CONCURRENCY);
    const vals = await Promise.all(batch.map(getValue));
    batch.forEach((k, idx) => {
      const pseudo = k.replace(/^alias:/, '');
      rows.push(`${pseudo},${vals[idx]}`);
    });
    process.stdout.write(`\r${Math.min(i + CONCURRENCY, keys.length)}/${keys.length}`);
  }

  rows.sort((a, b) => a.localeCompare(b, 'fr'));
  const csv = 'pseudo,identifiant_eva\n' + rows.join('\n') + '\n';
  const out = join(__dirname, 'joueurs.csv');
  writeFileSync(out, csv, 'utf8');
  console.log(`\n✅ ${rows.length} joueurs exportés -> ${out}`);
}

main().catch(e => { console.error(e); process.exit(1); });

// Bootstrap crawler — construit la base name -> identifier eva depuis competitive.eva.gg
// Usage : node tools/crawl.js
// Produit : tools/aliases.json        (map { "nom_minuscule": "Pseudo#code" })
//           tools/aliases-kv.json     (format bulk wrangler : [{key,value}, ...])
// Reprend automatiquement où il s'est arrêté (checkpoint dans tools/crawl-state.json)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://competitive.eva.gg/en_GB/api';
const OUT_ALIASES = join(__dirname, 'aliases.json');
const OUT_KV      = join(__dirname, 'aliases-kv.json');
const STATE       = join(__dirname, 'crawl-state.json');

const PAGE_SIZE   = 50;
const CONCURRENCY = 10;   // joueurs récupérés en parallèle
const RETRIES     = 3;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url, tries = RETRIES) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'eva-stats-bot/1.0' } });
      if (res.status === 429) { await sleep((i + 1) * 1500); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep((i + 1) * 800);
    }
  }
}

function load(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

async function main() {
  if (!existsSync(__dirname)) mkdirSync(__dirname, { recursive: true });

  const aliases = load(OUT_ALIASES, {});           // nom -> identifier
  const state   = load(STATE, { offset: 0, total: null, donePlayers: {} });
  const donePlayers = state.donePlayers || {};

  // 1) Parcours des équipes page par page
  while (true) {
    const page = await getJSON(`${BASE}/teams?limit=${PAGE_SIZE}&offset=${state.offset}`);
    const teams = page.items || [];
    state.total = page.range?.total ?? state.total;
    if (teams.length === 0) break;

    console.log(`Équipes ${state.offset}-${state.offset + teams.length} / ${state.total}`);

    // 2) Pour chaque équipe : membres -> ids joueurs
    for (const team of teams) {
      let members = [];
      try {
        members = await getJSON(`${BASE}/teams/${team.id}/members`);
      } catch (e) {
        console.warn(`  ! membres team ${team.id}: ${e.message}`);
        continue;
      }

      const ids = (members || [])
        .map(m => m.playerUser?.id)
        .filter(id => id && !donePlayers[id]);

      // 3) Récupère les joueurs en parallèle (par lots de CONCURRENCY)
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        const batch = ids.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async id => {
          try {
            const p = await getJSON(`${BASE}/player/${id}`);
            const eva = (p.connectionProviders || []).find(c => c.type === 'eva');
            if (eva?.identifier) {
              // clé = displayName eva (sans le code), en minuscule
              const display = eva.username || p.name;
              aliases[display.toLowerCase()] = eva.identifier;
            }
            donePlayers[id] = 1;
          } catch (e) {
            console.warn(`    ! player ${id}: ${e.message}`);
          }
        }));
      }
    }

    state.offset += teams.length;
    state.donePlayers = donePlayers;

    // Checkpoint après chaque page
    writeFileSync(OUT_ALIASES, JSON.stringify(aliases, null, 0));
    writeFileSync(STATE, JSON.stringify(state));
    console.log(`  -> ${Object.keys(aliases).length} alias enregistrés`);

    if (state.offset >= state.total) break;
  }

  // Export format bulk wrangler
  const kv = Object.entries(aliases).map(([k, v]) => ({ key: `alias:${k}`, value: v }));
  writeFileSync(OUT_KV, JSON.stringify(kv, null, 0));

  console.log(`\n✅ Terminé : ${Object.keys(aliases).length} joueurs`);
  console.log(`   ${OUT_ALIASES}`);
  console.log(`   ${OUT_KV}  (pour : wrangler kv:bulk put --binding=EVA_KV tools/aliases-kv.json)`);
}

main().catch(e => { console.error(e); process.exit(1); });

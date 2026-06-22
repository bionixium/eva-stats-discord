// EVA Battle Arena — Discord /stats + /setchannel commands
// Deploy on Cloudflare Workers (free)
// Required env vars  : DISCORD_PUBLIC_KEY
// Required KV binding: EVA_KV

const EVA_GRAPHQL = 'https://api.eva.gg/graphql';

// API publique de la plateforme compétitive (sert à résoudre pseudo -> pseudo#code)
const COMP_API = 'https://competitive.eva.gg/api';

// Crawl : nombre d'équipes traitées par déclenchement du cron (budget 50 sous-requêtes)
const TEAMS_PER_RUN = 6;

// Saison en cours — à incrémenter au changement de saison EVA.GG
// Attention : l'API décale le seasonId de +1 par rapport à l'affichage réel.
const DISPLAY_SEASON = 7;          // numéro affiché aux joueurs
const API_SEASON_ID  = 8;          // seasonId correspondant côté API EVA.GG

// Un seul appel, en passant explicitement la saison en cours pour avoir
// les vraies stats de la saison (sans paramètre l'API renvoie l'all-time)
const GQL_QUERY = `
query getPublicPlayerByUsername($username: String!, $seasonId: Int, $includeStatistics: Boolean = false) {
  getPublicPlayerByUsername(username: $username) {
    user { username displayName }
    experience(seasonId: $seasonId) { level seasonId }
    ...PlayerStatisticsField @include(if: $includeStatistics)
  }
}
fragment PlayerStatisticsField on Player {
  statistics(seasonId: $seasonId) {
    seasonId
    data {
      gameCount
      gameVictoryCount
      gameDefeatCount
      gameTime
      kills
      deaths
      assists
      killsByDeaths
      bestKillStreak
      traveledDistance
      traveledDistanceAverage
    }
  }
}`;

// ── Crypto ────────────────────────────────────────────────────────────────────

function hexToUint8Array(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
}

async function verifyDiscordRequest(publicKey, signature, timestamp, rawBody) {
  const key = await crypto.subtle.importKey(
    'raw', hexToUint8Array(publicKey), { name: 'Ed25519' }, false, ['verify']
  );
  return crypto.subtle.verify(
    { name: 'Ed25519' }, key,
    hexToUint8Array(signature),
    new TextEncoder().encode(timestamp + rawBody)
  );
}

// ── EVA API ───────────────────────────────────────────────────────────────────

async function fetchEvaStats(username) {
  const res = await fetch(EVA_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://app.eva.gg',
      'Referer': 'https://app.eva.gg/',
    },
    body: JSON.stringify({
      operationName: 'getPublicPlayerByUsername',
      query: GQL_QUERY,
      variables: { username, seasonId: API_SEASON_ID, includeStatistics: true },
    }),
  });

  if (res.status === 429) {
    throw new Error('EVA.GG limite les requêtes. Réessaie dans quelques secondes.');
  }
  if (!res.ok) throw new Error(`Erreur EVA API (${res.status})`);

  const json = await res.json();
  const player = json.data?.getPublicPlayerByUsername;
  if (!player) throw new Error('Joueur introuvable. Vérifie le pseudo (ex: `Pseudo#1234`)');

  return player;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '?';
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

function formatTime(seconds) {
  if (!seconds) return '?';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function formatDist(meters) {
  if (meters == null) return '?';
  return `${(meters / 1000).toFixed(1)} km`;
}

// ── Embed ─────────────────────────────────────────────────────────────────────

function buildEmbed(player, username) {
  const name     = player.user.displayName;
  const level    = player.experience?.level ?? '?';
  const seasonId = DISPLAY_SEASON;
  const s        = player.statistics?.data;

  const games   = s?.gameCount ?? 0;
  const wins    = s?.gameVictoryCount ?? 0;
  const losses  = s?.gameDefeatCount ?? 0;
  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;
  const kd      = s?.killsByDeaths != null ? s.killsByDeaths.toFixed(2) : '?';

  const profileUrl = `https://app.eva.gg/profile/public/${encodeURIComponent(username)}`;

  return {
    embeds: [{
      title: `${name}`,
      url: profileUrl,
      description: `**Niveau ${level}** · Saison ${seasonId} · [Voir le profil](${profileUrl})`,
      color: 0xF97316,
      fields: [
        // ── PARTIES ───────────────────────────────────────────────
        { name: '🎮 Parties jouées', value: `**${fmt(games)}**`, inline: true },
        { name: '✅ Victoires',      value: `**${fmt(wins)}** (${winRate}%)`, inline: true },
        { name: '❌ Défaites',       value: `**${fmt(losses)}**`, inline: true },
        { name: '⏱️ Temps de jeu',  value: `**${formatTime(s?.gameTime)}**`, inline: true },
        { name: '​',            value: '​', inline: true },
        { name: '​',            value: '​', inline: true },

        // ── SÉPARATEUR ────────────────────────────────────────────
        { name: '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬', value: '⚔️ **COMBAT**', inline: false },

        { name: '🔫 Kills',          value: `**${fmt(s?.kills)}**`,  inline: true },
        { name: '☠️ Morts',          value: `**${fmt(s?.deaths)}**`, inline: true },
        { name: '🤝 Assistances',    value: `**${fmt(s?.assists)}**`, inline: true },
        { name: '⚔️ K/D',            value: `**${kd}**`, inline: true },
        { name: '🔥 Meilleure série',value: `**${fmt(s?.bestKillStreak)}** kills`, inline: true },
        { name: '​',            value: '​', inline: true },

        // ── SÉPARATEUR ────────────────────────────────────────────
        { name: '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬', value: '🗺️ **DISTANCE**', inline: false },

        { name: '🗺️ Totale',        value: `**${formatDist(s?.traveledDistance)}**`,        inline: true },
        { name: '📏 Moy. / partie', value: `**${formatDist(s?.traveledDistanceAverage)}**`, inline: true },
        { name: '​',           value: '​', inline: true },
      ],
      footer: { text: `eva.gg • Saison ${seasonId}` },
      timestamp: new Date().toISOString(),
    }],
  };
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleSetChannel(body, env) {
  const guildId   = body.guild_id;
  const channelId = body.data.options?.[0]?.value ?? body.channel_id;

  await env.EVA_KV.put(`stats_channel:${guildId}`, channelId);

  return Response.json({
    type: 4,
    data: {
      content: `✅ Salon des stats configuré sur <#${channelId}>. La commande \`/stats\` ne fonctionnera plus qu'ici.`,
      flags: 64,
    },
  });
}

async function handleStats(body, env) {
  const guildId        = body.guild_id;
  const allowedChannel = await env.EVA_KV.get(`stats_channel:${guildId}`);

  if (allowedChannel && body.channel_id !== allowedChannel) {
    return Response.json({
      type: 4,
      data: {
        content: `❌ Cette commande est réservée au salon <#${allowedChannel}>.`,
        flags: 64,
      },
    });
  }

  const input = body.data.options[0].value.trim();
  let username = input;

  // Pseudo sans code : on tente de le retrouver dans la mémoire (alias KV)
  if (!username.includes('#')) {
    const cached = await env.EVA_KV.get(`alias:${input.toLowerCase()}`);
    if (!cached) {
      return Response.json({
        type: 4,
        data: {
          content:
            `❓ Je ne connais pas encore **${input}**.\n` +
            `Lance une première fois \`/stats ${input}#code\` (avec le numéro EVA.GG) — ` +
            `je le retiendrai et tu pourras ensuite taper juste \`/stats ${input}\`.\n` +
            `Tu trouves ton numéro sur https://app.eva.gg/profile`,
          flags: 64,
        },
      });
    }
    username = cached;
  }

  try {
    const player = await fetchEvaStats(username);

    // Mémorise l'alias : displayName (sans code) → username complet
    const display = player.user?.displayName;
    if (display && username.includes('#')) {
      const key = `alias:${display.toLowerCase()}`;
      // Lire avant d'écrire : évite de consommer le quota d'écritures KV
      // quand l'alias est déjà connu.
      const existing = await env.EVA_KV.get(key);
      if (existing !== username) await env.EVA_KV.put(key, username);
    }

    return Response.json({ type: 4, data: buildEmbed(player, username) });
  } catch (err) {
    return Response.json({
      type: 4,
      data: { content: `❌ ${err.message}`, flags: 64 },
    });
  }
}

// ── Crawl compétitif (cron) ─────────────────────────────────────────────────────
// Parcourt competitive.eva.gg par lots pour construire la base pseudo -> pseudo#code.
// Le curseur (offset) est stocké en KV ; à la fin il reboucle pour rester à jour.

async function compJSON(path) {
  const res = await fetch(`${COMP_API}${path}`, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'eva-stats-bot/1.0' },
  });
  if (!res.ok) throw new Error(`comp ${path}: HTTP ${res.status}`);
  return res.json();
}

async function crawlBatch(env) {
  const offset = parseInt(await env.EVA_KV.get('crawl:offset')) || 0;

  // 1 sous-requête : la page d'équipes
  const page = await compJSON(`/teams?limit=${TEAMS_PER_RUN}&offset=${offset}`);
  const teams = page.items || [];
  const total = page.range?.total ?? 0;

  let learned = 0;

  for (const team of teams) {
    let members = [];
    try {
      members = await compJSON(`/teams/${team.id}/members`);   // 1 sous-requête
    } catch { continue; }

    const ids = (members || []).map(m => m.playerUser?.id).filter(Boolean);

    for (const id of ids) {
      try {
        const p = await compJSON(`/player/${id}`);             // 1 sous-requête / joueur
        const eva = (p.connectionProviders || []).find(c => c.type === 'eva');
        if (eva?.identifier) {
          // Le pseudo peut changer, mais l'id joueur (et le #code) reste stable.
          // On ancre donc l'identité sur l'id via un index inverse `pid:<id>`
          // qui mémorise le dernier pseudo connu.
          const newKey  = (eva.username || p.name).toLowerCase();
          const prevKey = await env.EVA_KV.get(`pid:${id}`);

          // Changement de pseudo détecté → supprime l'ancienne entrée alias.
          if (prevKey && prevKey !== newKey) {
            await env.EVA_KV.delete(`alias:${prevKey}`);
          }

          // Écrit l'alias seulement s'il est nouveau ou a changé (économise le
          // quota d'écritures KV : 1000/jour ; les lectures sont à 100 000/jour).
          const existing = await env.EVA_KV.get(`alias:${newKey}`);
          if (existing !== eva.identifier) {
            await env.EVA_KV.put(`alias:${newKey}`, eva.identifier);
            learned++;
          }

          // Met à jour l'index inverse seulement si le pseudo a changé.
          if (prevKey !== newKey) {
            await env.EVA_KV.put(`pid:${id}`, newKey);
          }
        }
      } catch { /* joueur ignoré */ }
    }
  }

  // Avance le curseur ; reboucle à 0 quand on a tout parcouru
  let next = offset + teams.length;
  if (teams.length === 0 || next >= total) next = 0;
  await env.EVA_KV.put('crawl:offset', String(next));

  return { offset, next, total, learned };
}

// Rafraîchissement HEBDOMADAIRE.
// Le cron se déclenche souvent (toutes les 5 min) car un seul run ne peut traiter
// que ~6 équipes (limite de 50 sous-requêtes). Mais on ne crawle qu'une fois par
// semaine : tant que le tour complet de la base a été bouclé cette semaine, on ne
// fait rien (juste 1 lecture KV par tick, 0 écriture).
async function maybeCrawl(env) {
  const currentWeek = Math.floor(Date.now() / 604800000); // n° de semaine depuis epoch (7j)
  const doneWeek    = parseInt(await env.EVA_KV.get('crawl:week'));

  if (doneWeek === currentWeek) return; // déjà rafraîchi cette semaine -> veille

  const { next } = await crawlBatch(env);

  // next === 0 -> on a rebouclé à l'offset 0 = tour complet terminé pour la semaine
  if (next === 0) {
    await env.EVA_KV.put('crawl:week', String(currentWeek));
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export default {
  // Déclenché par le Cron Trigger configuré dans Cloudflare
  async scheduled(event, env, ctx) {
    ctx.waitUntil(maybeCrawl(env).catch(err => console.error('crawl:', err)));
  },

  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const signature = request.headers.get('X-Signature-Ed25519');
    const timestamp = request.headers.get('X-Signature-Timestamp');
    const rawBody   = await request.text();

    const valid = await verifyDiscordRequest(
      env.DISCORD_PUBLIC_KEY, signature, timestamp, rawBody
    ).catch(() => false);

    if (!valid) return new Response('Unauthorized', { status: 401 });

    const body = JSON.parse(rawBody);

    if (body.type === 1) return Response.json({ type: 1 });

    if (body.type === 2) {
      switch (body.data.name) {
        case 'setchannel': return handleSetChannel(body, env);
        case 'stats':      return handleStats(body, env);
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};

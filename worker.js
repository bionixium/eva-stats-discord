// EVA Battle Arena — Discord /stats + /setchannel commands
// Deploy on Cloudflare Workers (free)
// Required env vars  : DISCORD_PUBLIC_KEY
// Required KV binding: EVA_KV

const EVA_GRAPHQL = 'https://api.eva.gg/graphql';

// Requête 1 : infos de base + saison courante + stats all time
const GQL_BASE = `
query getBase($username: String!) {
  getPublicPlayerByUsername(username: $username) {
    user { username displayName }
    experience { level seasonId }
    statistics {
      data {
        gameCount gameVictoryCount gameDefeatCount gameDrawCount gameTime
        kills deaths assists killsByDeaths bestKillStreak
        traveledDistance traveledDistanceAverage
      }
    }
  }
}`;

// Requête 2 : stats de la saison courante uniquement
const GQL_SEASON = `
query getSeason($username: String!, $seasonId: Int!) {
  getPublicPlayerByUsername(username: $username) {
    experience(seasonId: $seasonId) { level }
    statistics(seasonId: $seasonId) {
      data {
        gameCount gameVictoryCount gameDefeatCount gameTime
        kills deaths assists killsByDeaths bestKillStreak
        traveledDistance traveledDistanceAverage
      }
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

async function gql(query, variables) {
  const res = await fetch(EVA_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://app.eva.gg',
      'Referer': 'https://app.eva.gg/',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Erreur EVA API (${res.status})`);
  return res.json();
}

async function fetchEvaStats(username) {
  // Appel 1 — base + all time
  const base = await gql(GQL_BASE, { username });
  const player = base.data?.getPublicPlayerByUsername;
  if (!player) throw new Error('Joueur introuvable. Vérifie le pseudo (ex: `Pseudo#1234`)');

  const seasonId = player.experience?.seasonId;

  // Appel 2 — stats saison courante (en parallèle c'est déjà séquentiel ici)
  const seasonData = seasonId
    ? await gql(GQL_SEASON, { username, seasonId })
    : null;

  const seasonPlayer = seasonData?.data?.getPublicPlayerByUsername;

  return {
    displayName : player.user.displayName,
    username    : player.user.username,
    seasonId,
    levelAllTime: player.experience?.level ?? '?',
    levelSeason : seasonPlayer?.experience?.level ?? '?',
    allTime     : player.statistics?.data ?? {},
    season      : seasonPlayer?.statistics?.data ?? {},
  };
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

function statsFields(s) {
  const games   = s?.gameCount ?? 0;
  const wins    = s?.gameVictoryCount ?? 0;
  const losses  = s?.gameDefeatCount ?? 0;
  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;
  const kd      = s?.killsByDeaths != null ? s.killsByDeaths.toFixed(2) : '?';

  return [
    { name: '🎮 Parties',          value: `**${fmt(games)}**`,                  inline: true },
    { name: '✅ Victoires',         value: `**${fmt(wins)}** (${winRate}%)`,     inline: true },
    { name: '❌ Défaites',          value: `**${fmt(losses)}**`,                 inline: true },
    { name: '⏱️ Temps de jeu',     value: `**${formatTime(s?.gameTime)}**`,     inline: true },
    { name: '​', value: '​', inline: true },
    { name: '​', value: '​', inline: true },
    { name: '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬', value: '⚔️ **COMBAT**', inline: false },
    { name: '🔫 Kills',             value: `**${fmt(s?.kills)}**`,              inline: true },
    { name: '☠️ Morts',             value: `**${fmt(s?.deaths)}**`,             inline: true },
    { name: '🤝 Assistances',       value: `**${fmt(s?.assists)}**`,            inline: true },
    { name: '⚔️ K/D',               value: `**${kd}**`,                         inline: true },
    { name: '🔥 Meilleure série',   value: `**${fmt(s?.bestKillStreak)}** kills`, inline: true },
    { name: '​', value: '​', inline: true },
    { name: '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬', value: '🗺️ **DISTANCE**', inline: false },
    { name: '🗺️ Totale',           value: `**${formatDist(s?.traveledDistance)}**`,        inline: true },
    { name: '📏 Moy. / partie',    value: `**${formatDist(s?.traveledDistanceAverage)}**`, inline: true },
    { name: '​', value: '​', inline: true },
  ];
}

// ── Embed ─────────────────────────────────────────────────────────────────────

function buildEmbed(data, username) {
  const profileUrl = `https://app.eva.gg/profile/public/${encodeURIComponent(username)}`;

  return {
    embeds: [{
      title: data.displayName,
      url: profileUrl,
      description: `[🔗 Voir le profil public](${profileUrl})`,
      color: 0xF97316,
      fields: [
        // ══ SAISON COURANTE ═══════════════════════════════════════
        {
          name: `━━━━━━━━━━ 🏆 SAISON ${data.seasonId} ━━━━━━━━━━`,
          value: `Niveau **${data.levelSeason}**`,
          inline: false,
        },
        ...statsFields(data.season),

        // ══ ALL TIME ══════════════════════════════════════════════
        {
          name: `━━━━━━━━━━━━ 🌍 ALL TIME ━━━━━━━━━━━━`,
          value: `Niveau **${data.levelAllTime}**`,
          inline: false,
        },
        ...statsFields(data.allTime),
      ],
      footer: { text: 'eva.gg Stats' },
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

  const username = body.data.options[0].value;

  if (!username.includes('#')) {
    return Response.json({
      type: 4,
      data: {
        content: `❌ Le pseudo doit inclure le numéro EVA.GG.\n**Exemple :** \`${username}#123456\`\nTrouve ton numéro sur https://app.eva.gg/profile`,
        flags: 64,
      },
    });
  }

  try {
    const data = await fetchEvaStats(username);
    return Response.json({ type: 4, data: buildEmbed(data, username) });
  } catch (err) {
    return Response.json({
      type: 4,
      data: { content: `❌ ${err.message}`, flags: 64 },
    });
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export default {
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

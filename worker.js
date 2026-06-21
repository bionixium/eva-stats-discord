// EVA Battle Arena — Discord /stats command
// Deploy on Cloudflare Workers (free)
// Required env vars: DISCORD_PUBLIC_KEY

const EVA_GRAPHQL = 'https://api.eva.gg/graphql';
const SEASON_ID = 8;

const GQL_QUERY = `
query getPublicPlayerByUsername($username: String!, $seasonId: Int, $includeStatistics: Boolean = false) {
  getPublicPlayerByUsername(username: $username) {
    user { username displayName }
    experience(seasonId: $seasonId) { level }
    ...PlayerStatisticsField @include(if: $includeStatistics)
  }
}
fragment PlayerStatisticsField on Player {
  statistics(seasonId: $seasonId) {
    data {
      gameCount
      gameVictoryCount
      gameDefeatCount
      kills
      deaths
      assists
      killsByDeaths
      gameTime
    }
  }
}`;

function hexToUint8Array(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
}

async function verifyDiscordRequest(publicKey, signature, timestamp, rawBody) {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToUint8Array(publicKey),
    { name: 'Ed25519' },
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    { name: 'Ed25519' },
    key,
    hexToUint8Array(signature),
    new TextEncoder().encode(timestamp + rawBody)
  );
}

async function fetchEvaStats(username) {
  const res = await fetch(EVA_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operationName: 'getPublicPlayerByUsername',
      query: GQL_QUERY,
      variables: { username, seasonId: SEASON_ID, includeStatistics: true },
    }),
  });

  if (!res.ok) throw new Error(`Erreur EVA API (${res.status})`);

  const json = await res.json();
  const player = json.data?.getPublicPlayerByUsername;
  if (!player) throw new Error('Joueur introuvable. Vérifie le pseudo (ex: `Pseudo#1234`)');

  return player;
}

function formatTime(seconds) {
  return `${(seconds / 3600).toFixed(1)}h`;
}

function buildEmbed(player) {
  const name = player.user.displayName;
  const level = player.experience?.level ?? '?';
  const s = player.statistics?.data;

  const winRate = s ? Math.round((s.gameVictoryCount / s.gameCount) * 100) : 0;
  const kd = s ? s.killsByDeaths.toFixed(2) : '?';

  return {
    embeds: [{
      title: `${name}`,
      description: `**Niveau ${level}** — After-H Battle Arena`,
      color: 0xF97316,
      fields: [
        { name: '🎮 Parties',      value: `${s?.gameCount ?? '?'}`,                    inline: true },
        { name: '🏆 Victoires',    value: `${s?.gameVictoryCount ?? '?'} (${winRate}%)`, inline: true },
        { name: '💀 Défaites',     value: `${s?.gameDefeatCount ?? '?'}`,               inline: true },
        { name: '🔫 Kills',        value: `${s?.kills ?? '?'}`,                         inline: true },
        { name: '☠️ Morts',        value: `${s?.deaths ?? '?'}`,                        inline: true },
        { name: '🤝 Assistances',  value: `${s?.assists ?? '?'}`,                       inline: true },
        { name: '⚔️ K/D',          value: kd,                                           inline: true },
        { name: '⏱️ Temps de jeu', value: s ? formatTime(s.gameTime) : '?',             inline: true },
      ],
      footer: { text: 'eva.gg • Saison 8' },
      timestamp: new Date().toISOString(),
    }],
  };
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const signature = request.headers.get('X-Signature-Ed25519');
    const timestamp = request.headers.get('X-Signature-Timestamp');
    const rawBody = await request.text();

    const valid = await verifyDiscordRequest(
      env.DISCORD_PUBLIC_KEY, signature, timestamp, rawBody
    ).catch(() => false);

    if (!valid) return new Response('Unauthorized', { status: 401 });

    const body = JSON.parse(rawBody);

    // Ping de vérification Discord
    if (body.type === 1) return Response.json({ type: 1 });

    // Slash command /stats
    if (body.type === 2 && body.data.name === 'stats') {
      const username = body.data.options[0].value;
      try {
        const player = await fetchEvaStats(username);
        return Response.json({ type: 4, data: buildEmbed(player) });
      } catch (err) {
        return Response.json({
          type: 4,
          data: { content: `❌ ${err.message}`, flags: 64 },
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};

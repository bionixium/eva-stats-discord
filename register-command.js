// Run once to register the /stats slash command on Discord
// Usage: node register-command.js

const APP_ID    = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APP_ID || !BOT_TOKEN) {
  console.error('Missing env vars: DISCORD_APP_ID and DISCORD_BOT_TOKEN required');
  process.exit(1);
}

const command = {
  name: 'stats',
  description: "Affiche les stats EVA Battle Arena d'un joueur",
  options: [{
    name: 'pseudo',
    description: 'Pseudo du joueur (ex: TKAxBionixium#805682)',
    type: 3,      // STRING
    required: true,
  }],
};

fetch(`https://discord.com/api/v10/applications/${APP_ID}/commands`, {
  method: 'POST',
  headers: {
    Authorization: `Bot ${BOT_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(command),
})
  .then(r => r.json())
  .then(res => {
    if (res.id) console.log(`✅ Commande /stats enregistrée (id: ${res.id})`);
    else console.error('❌ Erreur :', res);
  })
  .catch(console.error);

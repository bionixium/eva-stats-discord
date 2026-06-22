// Run once to register slash commands on Discord
// Usage: node register-command.js

const APP_ID    = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APP_ID || !BOT_TOKEN) {
  console.error('Missing env vars: DISCORD_APP_ID and DISCORD_BOT_TOKEN required');
  process.exit(1);
}

const commands = [
  {
    name: 'stats',
    description: "Affiche les stats EVA Battle Arena d'un joueur",
    options: [{
      name: 'pseudo',
      description: 'Pseudo du joueur (code #805682 requis la 1re fois, puis facultatif)',
      type: 3,      // STRING
      required: true,
    }],
  },
  {
    name: 'setchannel',
    description: 'Définit le salon réservé à la commande /stats',
    // Réservé aux administrateurs du serveur
    default_member_permissions: '8',
    options: [{
      name: 'salon',
      description: 'Salon à utiliser (laisse vide pour utiliser le salon actuel)',
      type: 7,      // CHANNEL
      required: false,
    }],
  },
  {
    name: 'liste',
    description: 'Affiche le nombre de joueurs indexés et l\'avancement du crawl',
  },
];

const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

fetch(url, {
  method: 'PUT',   // PUT remplace toutes les commandes globales en une fois
  headers: {
    Authorization: `Bot ${BOT_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(commands),
})
  .then(r => r.json())
  .then(res => {
    if (Array.isArray(res)) {
      res.forEach(cmd => console.log(`✅ /${cmd.name} enregistrée (id: ${cmd.id})`));
    } else {
      console.error('❌ Erreur :', res);
    }
  })
  .catch(console.error);

# EVA Stats Discord

Bot Discord affichant les statistiques publiques d'un joueur [EVA.GG](https://app.eva.gg) via la commande `/stats`.

Fonctionne sur **Cloudflare Workers** — gratuit, sans serveur à gérer.

---

## Fonctionnement

```
/stats TKAxBionixium#805682
```

Le bot interroge l'API GraphQL d'EVA.GG et retourne un embed Discord avec :

| Champ | Détail |
|---|---|
| 🎮 Parties | Nombre total de parties |
| 🏆 Victoires | Nombre + win rate |
| 💀 Défaites | Nombre de défaites |
| 🔫 Kills | Total de kills |
| ☠️ Morts | Total de morts |
| 🤝 Assistances | Total d'assistances |
| ⚔️ K/D | Ratio kills/deaths |
| ⏱️ Temps de jeu | Temps total en heures |

---

## Architecture

```
Serveur Discord
      │  POST (interaction /stats)
      ▼
Cloudflare Worker (worker.js)
      │  Vérifie la signature Ed25519
      │  POST api.eva.gg/graphql
      ▼
   EVA.GG API  →  JSON stats
      │
      ▼
  Embed Discord
```

**Aucun serveur dédié.** La requête Discord arrive directement sur Cloudflare Workers, qui appelle l'API EVA.GG et renvoie l'embed.

---

## Structure du projet

```
.
├── worker.js            # Logique principale (Cloudflare Worker)
├── register-command.js  # Script one-shot : enregistre /stats sur Discord
└── README.md
```

### `worker.js`

- Valide la signature Ed25519 de Discord (`DISCORD_PUBLIC_KEY`)
- Répond au ping de vérification Discord (type 1)
- Sur `/stats <pseudo>` : appelle l'API EVA.GG et retourne un embed formaté
- Gère les erreurs (joueur introuvable, API indisponible)

### `register-command.js`

Script Node.js à exécuter **une seule fois** pour enregistrer la commande `/stats` auprès de Discord.

---

## Déploiement

### Prérequis

- Compte [Cloudflare](https://cloudflare.com) (gratuit)
- Compte [Discord Developer](https://discord.com/developers/applications)
- Node.js installé localement (pour `register-command.js` uniquement)

---

### 1. Créer l'application Discord

1. Va sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. **New Application** → donne un nom
3. Onglet **Bot** → copie le **Bot Token**
4. Onglet **General Information** → copie l'**Application ID** et la **Public Key**
5. Onglet **OAuth2 → URL Generator** :
   - Scopes : `applications.commands`
   - Copie l'URL et invite le bot sur ton serveur

---

### 2. Déployer sur Cloudflare Workers

#### Via le dashboard Cloudflare (sans CLI)

1. Va sur [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create**
2. **Create Worker** → édite le code en collant le contenu de `worker.js`
3. **Save and Deploy** → copie l'URL du Worker (ex: `https://eva-stats.TON_SOUS_DOMAINE.workers.dev`)

#### Via Wrangler CLI

```bash
npm install -g wrangler
wrangler login
wrangler deploy worker.js --name eva-stats-discord --compatibility-date 2024-01-01
```

---

### 3. Configurer la variable d'environnement

Dans le dashboard Cloudflare → ton Worker → **Settings → Variables** :

| Variable | Valeur |
|---|---|
| `DISCORD_PUBLIC_KEY` | La Public Key copiée à l'étape 1 |

---

### 4. Connecter Discord au Worker

Dans le [Developer Portal Discord](https://discord.com/developers/applications) → ton app → **General Information** :

- **Interactions Endpoint URL** : colle l'URL de ton Cloudflare Worker

Discord va envoyer un ping de vérification — le Worker doit répondre `{ type: 1 }` (c'est déjà géré dans `worker.js`).

---

### 5. Enregistrer la commande `/stats`

```bash
DISCORD_APP_ID=ton_app_id DISCORD_BOT_TOKEN=ton_bot_token node register-command.js
```

Sur Windows (PowerShell) :

```powershell
$env:DISCORD_APP_ID="ton_app_id"
$env:DISCORD_BOT_TOKEN="ton_bot_token"
node register-command.js
```

---

## Mise à jour de saison

En début de nouvelle saison EVA.GG, modifie la variable dans `worker.js` :

```js
const SEASON_ID = 9; // ← incrémenter
```

Puis redéployez le Worker.

---

## API EVA.GG

| Propriété | Valeur |
|---|---|
| Endpoint | `https://api.eva.gg/graphql` |
| Méthode | `POST` |
| Opération | `getPublicPlayerByUsername` |
| Auth | Aucune (profils publics) |

---

## Limites

- Les profils **privés** sur EVA.GG ne sont pas accessibles
- Le pseudo doit correspondre exactement au format EVA.GG (ex: `Pseudo#1234`)
- Cloudflare Workers free tier : 100 000 requêtes/jour

---

## Licence

MIT

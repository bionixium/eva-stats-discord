# EVA Stats Discord

Bot Discord affichant les statistiques publiques d'un joueur [EVA.GG](https://app.eva.gg) via la commande `/stats`.

Fonctionne sur **Cloudflare Workers** — gratuit, sans serveur à gérer.

---

## Commandes

| Commande | Accès | Description |
|---|---|---|
| `/stats <pseudo>` | Tout le monde | Affiche les stats EVA.GG d'un joueur |
| `/setchannel [#salon]` | Administrateurs uniquement | Définit le salon réservé à `/stats` |

### `/setchannel`

```
/setchannel #stats-eva
```

Configure le salon dans lequel la commande `/stats` sera autorisée. Si quelqu'un l'utilise ailleurs, il reçoit un message éphémère (visible uniquement par lui) indiquant le bon salon.

- Le salon est **persisté dans Cloudflare KV** — il survit aux redéploiements du Worker.
- Sans salon configuré, `/stats` fonctionne partout.
- Réservé aux membres avec la permission **Administrateur**.

---

## Champs affichés par `/stats`

| Champ | Détail |
|---|---|
| 🎮 Parties | Total · Victoires · Défaites · Nuls |
| 🏆 Win Rate | Pourcentage de victoires + barre de progression |
| ⏱️ Temps de jeu | Temps total en heures et minutes |
| 🔫 Kills | Total d'éliminations |
| ☠️ Morts | Total de morts |
| 🤝 Assistances | Total d'assistances |
| ⚔️ K/D | Ratio kills/deaths |
| 🔥 Meilleure série | Meilleure série d'éliminations consécutives |
| 🗺️ Distance totale | Distance totale parcourue (km) |
| 📏 Moy. / partie | Distance moyenne parcourue par partie (km) |

---

## Architecture

```
Serveur Discord
      │  POST (interaction)
      ▼
Cloudflare Worker (worker.js)
      │  Vérifie la signature Ed25519
      ├─ /setchannel ──► Cloudflare KV  (stocke channel_id par guild)
      └─ /stats      ──► KV (lecture) + api.eva.gg/graphql
                                │
                                ▼
                          Embed Discord
```

**Aucun serveur dédié.** Les interactions Discord arrivent directement sur Cloudflare Workers.

---

## Structure du projet

```
.
├── worker.js            # Logique principale (Cloudflare Worker)
├── register-command.js  # Script one-shot : enregistre les commandes sur Discord
└── README.md
```

### `worker.js`

- Valide la signature Ed25519 de Discord (`DISCORD_PUBLIC_KEY`)
- Répond au ping de vérification Discord (type 1)
- `/setchannel` : stocke l'ID du salon dans Cloudflare KV (`EVA_KV`)
- `/stats` : vérifie le salon autorisé (KV), appelle l'API EVA.GG, retourne un embed

### `register-command.js`

Script Node.js à exécuter **une seule fois** pour enregistrer `/stats` et `/setchannel` auprès de Discord.

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

### 2. Créer le namespace Cloudflare KV

1. Va sur [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **KV**
2. **Create a namespace** → nom : `EVA_KV` → **Add**
3. Note l'**ID** du namespace (tu en auras besoin à l'étape suivante)

---

### 3. Déployer le Worker

#### Via le dashboard Cloudflare (sans CLI)

1. **Workers & Pages** → **Create** → **Create Worker**
2. Colle le contenu de `worker.js` → **Save and Deploy**
3. Dans les paramètres du Worker → **Settings → Bindings** → **Add binding** :
   - Type : **KV Namespace**
   - Variable name : `EVA_KV`
   - KV Namespace : sélectionne `EVA_KV` créé à l'étape 2
4. Copie l'URL du Worker (ex: `https://eva-stats.TON_SOUS_DOMAINE.workers.dev`)

#### Via Wrangler CLI

Crée un fichier `wrangler.toml` :

```toml
name = "eva-stats-discord"
main = "worker.js"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "EVA_KV"
id = "REMPLACE_PAR_TON_KV_NAMESPACE_ID"
```

Puis déploie :

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

---

### 4. Configurer la variable d'environnement

Dans le dashboard Cloudflare → ton Worker → **Settings → Variables** :

| Variable | Obligatoire | Valeur |
|---|---|---|
| `DISCORD_PUBLIC_KEY` | ✅ | La Public Key copiée à l'étape 1 |

---

### 5. Connecter Discord au Worker

Dans le [Developer Portal Discord](https://discord.com/developers/applications) → ton app → **General Information** :

- **Interactions Endpoint URL** : colle l'URL de ton Cloudflare Worker

Discord va envoyer un ping de vérification — le Worker doit répondre `{ type: 1 }` (c'est déjà géré).

---

### 6. Enregistrer les commandes

```bash
# Linux / macOS
DISCORD_APP_ID=ton_app_id DISCORD_BOT_TOKEN=ton_bot_token node register-command.js
```

```powershell
# Windows (PowerShell)
$env:DISCORD_APP_ID="ton_app_id"
$env:DISCORD_BOT_TOKEN="ton_bot_token"
node register-command.js
```

Les deux commandes (`/stats` et `/setchannel`) sont enregistrées en une seule passe.

---

### 7. Configurer le salon (dans Discord)

Dans ton serveur Discord, en tant qu'administrateur :

```
/setchannel #stats-eva
```

La commande `/stats` sera désormais restreinte à ce salon.

---

## Mise à jour de saison

En début de nouvelle saison EVA.GG, modifie la variable dans `worker.js` :

```js
const SEASON_ID = 9; // ← incrémenter
```

Puis redéploie le Worker (copier-coller dans le dashboard ou `wrangler deploy`).

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
- Cloudflare KV free tier : 100 000 lectures/jour, 1 000 écritures/jour

---

## Licence

MIT

# EVA Stats Discord

Commande `/stats` pour afficher les stats After-H Battle Arena d'un joueur directement dans Discord.

**100% gratuit — aucun serveur, aucun PC allumé requis.**

---

## Comment ça marche

```
/stats TKAxBionixium#805682
         ↓
Cloudflare Worker (gratuit)
         ↓
API eva.gg (GraphQL public)
         ↓
Embed Discord avec les stats
```

---

## Prérequis

- Un compte [Discord Developer Portal](https://discord.com/developers) (gratuit)
- Un compte [Cloudflare](https://cloudflare.com) (gratuit)
- Node.js installé sur ton PC (juste pour l'étape d'enregistrement)

---

## Installation

### Étape 1 — Créer l'application Discord

1. Va sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. Clique **New Application** → donne un nom (ex: `EVA Stats`)
3. Note l'**Application ID** (onglet General Information)
4. Note la **Public Key** (onglet General Information)
5. Va dans l'onglet **Bot** → clique **Reset Token** → copie le token

---

### Étape 2 — Déployer sur Cloudflare Workers

1. Crée un compte gratuit sur [cloudflare.com](https://cloudflare.com)
2. Dans le dashboard → **Workers & Pages** → **Create** → **Create Worker**
3. Clique **Edit code**
4. Efface tout le code existant et colle le contenu de `worker.js`
5. Clique **Deploy**
6. Note l'URL de ton worker (ex: `https://eva-stats.ton-user.workers.dev`)

---

### Étape 3 — Ajouter la clé publique Discord

Dans le dashboard de ton Worker :
1. Va dans **Settings** → **Variables**
2. Clique **Add variable**
3. Nom : `DISCORD_PUBLIC_KEY` | Valeur : ta Public Key Discord (étape 1)
4. Clique **Save**

---

### Étape 4 — Brancher l'URL dans Discord

1. Retourne sur [discord.com/developers/applications](https://discord.com/developers/applications) → ton app
2. Onglet **General Information**
3. **Interactions Endpoint URL** → colle l'URL de ton Worker
4. Clique **Save Changes** — Discord va vérifier le Worker (doit afficher ✅)

---

### Étape 5 — Enregistrer la commande /stats

Dans ton terminal (dossier du projet) :

```bash
DISCORD_APP_ID=ton_app_id DISCORD_BOT_TOKEN=ton_bot_token node register-command.js
```

Sur Windows (PowerShell) :
```powershell
$env:DISCORD_APP_ID="ton_app_id"
$env:DISCORD_BOT_TOKEN="ton_bot_token"
node register-command.js
```

Tu dois voir : `✅ Commande /stats enregistrée`

---

### Étape 6 — Ajouter le bot à ton serveur

1. Onglet **OAuth2** → **URL Generator**
2. Coche **`applications.commands`** uniquement
3. Copie l'URL générée → ouvre-la dans un navigateur → ajoute le bot à ton serveur

---

## Utilisation

```
/stats pseudo:TKAxBionixium#805682
```

> Le pseudo doit inclure le `#` et les chiffres. Tu trouves le pseudo complet sur ton profil eva.gg.

---

## Mise à jour de la saison

Si une nouvelle saison commence, modifie la ligne suivante dans `worker.js` :

```js
const SEASON_ID = 8; // ← changer le numéro ici
```

Puis recolle le fichier dans le Worker Cloudflare.

---

## Structure du projet

```
├── worker.js             # Code du Cloudflare Worker
├── register-command.js   # Script d'enregistrement de la commande (à lancer une fois)
└── README.md
```

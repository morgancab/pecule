# Pécule

Suivi et analyse de patrimoine inspiré de Finary, à partir de ton tableau de suivi Google Sheets.
Fonctionne en local et en ligne (Vercel), installable sur téléphone, protégé par mot de passe.

## Comment ça marche

```
Téléphone / PC ──(mot de passe, cookie de session)──▶ Vercel : interface + API /api/*
                                                          │  (GSHEET_URL et GSHEET_TOKEN, côté serveur uniquement)
                                                          ▼
                                     Script Apps Script dans TA feuille Google ──▶ soldes + réglages
```

- **Source des soldes** : ta feuille Google (une ligne par date, une colonne par compte).
- **Tes réglages** (noms affichés, types de comptes, références de marché, préférences) : enregistrés dans ton compte Google par le script (PropertiesService). Aucune base de données ailleurs.
- **Cache local** : une copie des données reste sur l’appareil pour un affichage immédiat ; elle est effacée à la déconnexion.

## Sécurité

- Toute l’API exige une session ouverte avec `APP_PASSWORD` : cookie HttpOnly, Secure, SameSite=Strict, signé (HMAC) avec `SESSION_SECRET`, valable 6 mois. Chaque mauvais mot de passe coûte 1,5 s.
- L’adresse et le jeton du script Google ne sont jamais envoyés au navigateur ni versionnés : ce sont des variables d’environnement Vercel.
- Le script ne répond qu’avec le bon jeton. Ta feuille reste privée.
- Aucune donnée personnelle dans le dépôt : `data/` et `.env*` sont exclus par `.gitignore`.
- En-têtes de sécurité (CSP stricte, pas d’iframe, pas d’indexation par les moteurs de recherche) : `vercel.json`.
- Le service worker ne met en cache que l’interface, jamais les réponses de l’API.

Choisis un mot de passe long (une phrase de 4 ou 5 mots). Garde le dépôt GitHub **privé** par précaution.

## 1. Mettre à jour le script Google

Le script doit pouvoir lire la feuille **et** enregistrer tes réglages.

1. Dans ta feuille : Extensions → Apps Script.
2. Remplace tout le code par celui de `apps-script/Code.gs` en renseignant `TOKEN`, `SPREADSHEET_ID` et `SHEET_ID`.
   (Version déjà remplie pour toi, en local uniquement : `data/apps-script-a-coller.gs`.)
3. Enregistre, puis « Déployer » → « Gérer les déploiements » → crayon → Version : **Nouvelle version** → Déployer.
   L’adresse `/exec` ne change pas.

## 2. En local

1. `npm install` (une fois).
2. Copie `.env.example` en `.env.local` et remplis les 4 variables (déjà fait sur ce PC).
3. `npm start` (ou double-clic sur `Lancer Pecule.bat`) → http://127.0.0.1:5180

## 3. Déployer sur GitHub et Vercel

1. **GitHub** : crée un dépôt **privé** (github.com → New repository, sans README), puis :
   ```
   git remote add origin https://github.com/<toi>/pecule.git
   git push -u origin main
   ```
2. **Vercel** : vercel.com → Add New → Project → importe le dépôt. Vercel reconnaît Vite (réglages dans `vercel.json`).
3. Avant (ou juste après) le premier déploiement : Settings → Environment Variables, ajoute pour *Production* :
   | Variable | Valeur |
   |---|---|
   | `APP_PASSWORD` | ton mot de passe (12 caractères minimum) |
   | `SESSION_SECRET` | 32+ caractères aléatoires (ex. sortie de `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) |
   | `GSHEET_URL` | l’adresse `/exec` du script |
   | `GSHEET_TOKEN` | le même jeton que dans le script |
4. Redéploie (Deployments → … → Redeploy) pour prendre en compte les variables.

Sans ces variables, l’app affiche « Configuration incomplète » et ne sert aucune donnée.

## 4. Installer sur le téléphone

- **iPhone (Safari)** : ouvre l’adresse Vercel → bouton Partager → « Sur l’écran d’accueil ».
- **Android (Chrome)** : ouvre l’adresse → menu ⋮ → « Installer l’application » (ou « Ajouter à l’écran d’accueil »).

Connecte-toi une fois : la session dure 6 mois sur l’appareil. « Se déconnecter » (Réglages) efface la copie locale.

## Pages

| Page | Ce qu’elle fait |
|---|---|
| Tableau de bord | Patrimoine net et évolution, répartition, épargne estimée par mois, effet des marchés et intérêts sur 12 mois, argent qui dort, dernier rapport, diversification, points d’attention |
| Patrimoine | Comptes lus depuis la feuille, rangés par classe, variation sur 12 mois. Fiche d’un compte : nom affiché, type, taux, référence de marché, clôture |
| Analyses | D’où vient ta progression (épargne / marchés / intérêts), euros constants, actions Amazon (cours vs actions reçues), placements face à leur référence, argent qui dort, livrets face à l’inflation, répartition dans le temps, projection, plus fortes baisses, points d’attention, détail par compte |
| Projection | Simulateur : épargne mensuelle, rendement par classe d’actifs, horizon, euros courants ou d’aujourd’hui ; scénarios prudent / central / favorable, prochains paliers, « et si… » |
| Diversification | Score sur 10 (classes d’actifs, géographie, secteurs, concentration) |
| Rapports | Un rapport par relevé : variation, part épargne / marchés, comparaison, comptes qui ont bougé, record, répartition avant / après |
| Réglages | Thème, synchronisation, déconnexion, export JSON |

## Données publiques utilisées

- Cours de clôture quotidiens (Yahoo Finance), convertis en euros, selon les références choisies (Amazon, MSCI World, S&P 500, Bitcoin, Ethereum).
- Indice des prix harmonisé France (Eurostat).
- Taux officiels du Livret A : table dans `src/lib/market.ts`, à compléter à chaque révision (février et août).

Seuls les symboles des indices sont envoyés à ces services.

**Limites** : la feuille ne contient que des soldes ; la part « épargne » est estimée en retirant l’effet des cours. Simulations indicatives, pas des conseils en investissement.

## Développement

- `npm run dev` : serveur de développement (API comprise, configurée par `.env.local`)
- `npm run typecheck` · `npm run build`
- API : `server/core.ts` (logique commune), `api/*.ts` (fonctions Vercel), `server/devPlugin.ts` (local)

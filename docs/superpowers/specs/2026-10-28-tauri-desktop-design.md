# Cadrage : Steam Inventory Board en application de bureau (Tauri)

Date : 28/10/2026. Complète `SPEC.md` (v1), qui reste la référence pour les fonctionnalités.

## Intention

Aujourd'hui, l'outil demande Node, un `.env` et `npm start`, puis un navigateur sur `localhost:3000`. On veut un **`.exe` Windows** qu'on lance d'un double-clic, où le **SteamID se saisit dans l'application**. Une page web pure est exclue : Steam n'autorise pas les appels depuis un navigateur (pas d'en-tête CORS sur l'inventaire, preflight en 404 sur le carnet d'ordres, vérifié le 28/10/2026).

## Objectifs

- Mêmes fonctionnalités que la v1 actuelle (`master`, commit `7de8b4a`) : tableau, filtres, tri, pied de tableau, prix à la demande avec file d'attente et backoff, liens marché et collection, messages d'erreur, interface en anglais.
- Un exécutable Windows autonome, sans Node ni serveur local.
- Le SteamID saisi dans un écran de réglages, conservé entre deux lancements.
- Cache SQLite conservé, avec le même rôle qu'aujourd'hui (inventaire, prix sans expiration).

## Non-objectifs

- Pas de version web, pas de proxy, pas de serveur.
- Pas de macOS ni de Linux pour l'instant (rien ne doit l'empêcher plus tard, mais ce n'est ni construit ni testé).
- Pas de multi-comptes simultanés : un seul SteamID à la fois.
- Pas de mise à jour automatique de l'application, pas de signature de l'exécutable.
- Pas d'import de l'ancienne base `data/inventory.db` : les prix déjà relevés sont abandonnés (accord explicite).

## Anti-objectifs (échec même si « ça marche »)

- Un appel au marché sans clic de l'utilisateur.
- Des requêtes Steam autorisées vers d'autres domaines que ceux listés plus bas.
- Un lien qui s'ouvre dans la fenêtre de l'application au lieu du navigateur de l'utilisateur.
- Un identifiant, un mot de passe ou un cookie Steam demandé ou stocké.

## Contraintes

- Tauri v2. Chaîne d'outils présente sur la machine : Rust 1.98.1, WebView2 (Windows 11).
- Versions de bibliothèques : celles réellement installées au moment du build, vérifiées dans la documentation officielle.
- Rate limit du marché inchangé : une requête à la fois, intervalle minimal de 3 s, backoff 30 s / 60 s / 120 s sur 429, abandon après 3 nouvelles tentatives.
- Projet entièrement en TypeScript côté interface, le moins de Rust possible (enregistrement des plugins, migrations, permissions).

## Décisions prises (avec l'utilisateur)

- **Option B** : plus de serveur Node. La page appelle Steam via `tauri-plugin-http` et SQLite via `tauri-plugin-sql`.
- **SteamID paramétrable dans l'application** ; le `.env` disparaît.
- **Base neuve** dans le dossier de données de l'application ; les prix déjà relevés ne sont pas repris.

## Architecture

```
src/core/      logique pure, sans DOM ni Tauri, testée avec node:test
               (regroupement de l'inventaire, lecture du carnet d'ordres, file d'attente,
                filtres/tri/totaux, formats, messages)
src/data/      accès à la base derrière une petite interface, avec deux adaptateurs :
               tauri-plugin-sql dans l'app, better-sqlite3 en mémoire dans les tests
src/web/       interface (page actuelle, écran de réglages)
src-tauri/     coquille Rust : plugins sql, http, opener ; migrations ; permissions
scripts/       recon.ts conservé (vérification manuelle des endpoints Steam, sous Node)
```

- **Appels réseau** : les fonctions existantes reçoivent déjà un `fetch` injecté ; dans l'app, on leur passe le `fetch` de `@tauri-apps/plugin-http`. Les requêtes partent donc de l'IP de l'utilisateur.
- **Permissions HTTP** : n'autoriser que `https://steamcommunity.com/inventory/*` et `https://steamcommunity.com/market/orderbook*`.
- **Images** : chargées par des `<img>` depuis `https://community.fastly.steamstatic.com/economy/image/*` ; la politique de sécurité (CSP) de la fenêtre doit l'autoriser, et rien d'autre en externe.
- **Liens** : marché et collection ouverts dans le navigateur par défaut via `tauri-plugin-opener` (`openUrl`), avec une permission limitée à `https://steamcommunity.com/*`.
- **Base** : mêmes tables qu'aujourd'hui (`items` avec `app_id`, `prices`, `meta`), créées par une migration initiale déclarée côté Rust. Les migrations ad hoc de la v1 (colonne `app_id`, langue du cache) disparaissent puisque la base repart de zéro.
- **Méta** : `inventory_fetched_at`, et `inventory_steam_id` à la place de `inventory_language`.

## Comportement

- **Premier lancement** (aucun SteamID) : l'écran de réglages s'affiche à la place du tableau. Champ SteamID64, validé à la saisie (17 chiffres), avec un lien d'aide expliquant où le trouver. Une fois enregistré, l'inventaire est récupéré.
- **Lancements suivants** : le tableau s'affiche immédiatement depuis le cache (moins de 2 s), sans appel à Steam.
- **Changement de SteamID** depuis les réglages (accessibles par une icône dans l'en-tête) : l'inventaire est récupéré à nouveau pour ce compte. Les prix sont conservés, car ils dépendent de l'objet, pas du compte.
- **Inventaire privé ou introuvable** : message actuel, affiché aussi dans l'écran de réglages si c'est le premier chargement.
- **Données Steam** demandées en anglais, sans réglage de langue (l'interface est en anglais).

## Laissé au constructeur (choix marqués comme tels)

- **Devise** (mon choix) : la v1 refuse tout ce qui n'est pas l'EUR. Comme d'autres personnes pourront saisir leur SteamID, l'app accepte la devise que Steam renvoie (`eCurrency`), l'enregistre avec chaque prix et l'affiche avec le bon symbole via une table des codes devise Steam ; un code inconnu donne une erreur claire. Le réglage `CURRENCY` disparaît.
- **Livrable** (mon choix) : l'exécutable portable produit par `tauri build` (`steam-inventory-board.exe`), plus l'installeur NSIS généré au passage.
- **Fenêtre** : titre « Steam Inventory Board », taille par défaut adaptée au tableau (au moins 1 400 px de large si l'écran le permet), taille minimale raisonnable.
- **Icône** de l'application : simple, cohérente avec la page (par exemple le motif 2 × 2 carreaux).
- **Cookies** : désactiver la fonctionnalité `cookies` de `tauri-plugin-http` si elle est active par défaut, pour respecter « aucun cookie stocké ».
- Organisation exacte des fichiers et des scripts npm (`tauri dev`, `tauri build`, `test`, `typecheck`).

## Critères d'acceptation

- `npm run tauri build` produit un `.exe` qui se lance sur une machine Windows 11 sans Node.
- Premier lancement : écran de réglages, SteamID invalide refusé, SteamID valide → inventaire affiché.
- Second lancement : tableau affiché en moins de 2 s, aucun appel réseau.
- Changer de SteamID recharge l'inventaire du nouveau compte et conserve les prix existants.
- Les critères de prix de la v1 restent vrais (20 clics rapides → jamais deux requêtes à moins de 3 s ; 429 gérés ; prix et date présents après redémarrage).
- Les liens marché et collection s'ouvrent dans le navigateur par défaut.
- Les tests de la logique pure et de la couche base passent avec `npm test`.

## Suite

Après validation de ce cadrage : plan d'implémentation par étapes, puis mise à jour de `SPEC.md` (architecture, configuration) et du README.

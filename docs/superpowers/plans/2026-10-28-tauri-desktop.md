# Steam Inventory Board en application Tauri — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** remplacer le serveur Node par une application de bureau Tauri v2 (`.exe` Windows) où le SteamID se saisit dans l'app, en gardant SQLite et toutes les fonctionnalités de la v1.

**Architecture :** la logique pure (déjà testée) passe dans `src/core`. L'accès à SQLite est réécrit en asynchrone dans `src/data`, derrière une interface `SqlClient` qui a deux implémentations : `tauri-plugin-sql` dans l'app, `better-sqlite3` en mémoire dans les tests. `src/app/board.ts` reprend le rôle des routes Fastify (orchestration inventaire / prix / file d'attente) et la page l'appelle directement. `src-tauri/` ne contient que l'enregistrement des plugins (sql, http, opener), la migration et les permissions.

**Tech Stack :** Tauri v2, `@tauri-apps/plugin-sql` (SQLite), `@tauri-apps/plugin-http`, `@tauri-apps/plugin-opener`, Vite, TypeScript (type stripping Node 22 pour les tests), `node:test`, `better-sqlite3` (tests uniquement).

**Spec :** `docs/superpowers/specs/2026-10-28-tauri-desktop-design.md`, avec `SPEC.md` pour les fonctionnalités.

## Global Constraints

- Tauri v2 ; versions réellement installées, API vérifiées dans la documentation officielle (Context7) avant usage.
- Aucun appel au marché sans clic. File : une requête à la fois, `intervalMs` 3000, `backoffMs` 30000, `maxRetries` 3 (valeurs de `src/server/main.ts`, inchangées).
- Requêtes HTTP autorisées uniquement vers `https://steamcommunity.com/inventory/*` et `https://steamcommunity.com/market/orderbook*`.
- Images autorisées uniquement depuis `https://community.fastly.steamstatic.com/economy/image/*`.
- Liens ouverts via `openUrl` (plugin opener), permission limitée à `https://steamcommunity.com/*`.
- Aucun cookie stocké : fonctionnalité `cookies` de `tauri-plugin-http` désactivée si elle est active par défaut.
- Données Steam demandées avec `l=english` ; interface en anglais (textes existants inchangés).
- SteamID : exactement 17 chiffres après suppression des espaces autour.
- Commentaires et docs de code en anglais ; docs du projet (`SPEC.md`, cadrage, plan) en français.
- Petits incréments : chaque tâche se termine par `npm test`, `npm run typecheck` verts et un commit.

## Review Focus

1. Inventaire de 2 608 objets enregistré via le plugin SQL : la limite de paramètres SQLite ne doit pas être dépassée → test d'enregistrement de 3 000 objets (tâche 3).
2. Application fermée pendant l'enregistrement de l'inventaire : au lancement suivant, le cache partiel doit être considéré comme périmé et rechargé → test (tâche 3).
3. SteamID collé avec des espaces, ou URL de profil collée à la place → espaces retirés acceptés ; URL refusée avec un message qui dit quoi saisir → tests (tâche 7).
4. Clic sur un prix pendant qu'un rafraîchissement d'inventaire retire l'objet → erreur « Unknown item » dans la cellule, pas de plantage → test (tâche 5).
5. Devise renvoyée inconnue de la table → prix non enregistré, message clair → test (tâche 2).

---

### Task 1 : Regrouper la logique pure dans `src/core` et retirer le serveur Node

Déplacement sans changement de comportement de la logique pure. Le serveur Fastify est retiré tout de suite (sinon chaque changement de type des tâches suivantes devrait aussi le maintenir) : ses tests restent consultables au commit `7de8b4a` et sont repris en asynchrone aux tâches 3 et 5. La page ne fonctionne plus jusqu'à la tâche 5 ; c'est accepté.

**Files :**
- Move (git mv) : `src/server/{inventory,market,queue}.ts` et leurs tests → `src/core/` ; `src/web/{table,format,messages,prices}.ts` et leurs tests → `src/core/`.
- Create : `src/core/items.ts` (types `Prices`, `BoardItem`, sortis de `src/server/db.ts`).
- Delete : `src/server/{app,db,main}.ts`, `src/server/{app,db,prices-route}.test.ts`.
- Modify : imports de `src/web/*.ts` et des tests ; `package.json` (retirer `fastify`, `@fastify/static` et le script `start` ; `better-sqlite3` passe en devDependency) ; `vite.config.ts` (retirer le proxy `/api`).

**Interfaces :**
- Produces : `src/core/items.ts` exporte `type Prices = OrderBookPrices & { fetchedAt: string }` et `type BoardItem = Item & { prices: Prices | null }`. Tous les exports déplacés gardent nom et signature.

- [ ] **Step 1 :** `git mv`, création de `items.ts`, suppressions, mise à jour de `package.json` puis `npm install`.
- [ ] **Step 2 :** corriger les imports. Run : `npm run typecheck` → aucune erreur.
- [ ] **Step 3 :** Run : `npm test` → tous les tests restants passent (ceux de `src/core`).
- [ ] **Step 4 :** Commit `Move pure logic to src/core and drop the Node server`.

### Task 2 : Accepter la devise renvoyée par Steam

**Files :**
- Create : `src/core/currency.ts`, `src/core/currency.test.ts`
- Modify : `src/core/market.ts`, `src/core/market.test.ts`, `src/core/items.ts`, `src/core/format.ts`, `src/core/format.test.ts`

**Interfaces :**
- Produces :
  - `currency.ts` : `function currencyCode(steamId: number): string | null` (code ISO 4217 ou null) ; table `STEAM_CURRENCIES` avec au minimum 1 USD, 2 GBP, 3 EUR, 5 RUB, 6 PLN, 7 BRL, 8 JPY, 9 NOK, 20 CAD, 21 AUD, 23 CNY, 24 INR.
  - `market.ts` : `type OrderBookPrices = { sell: number | null; buy: number | null; currency: number }` ; `fetchOrderBook(marketHashName: string, fetchFn?: FetchFn): Promise<OrderBookPrices>` (plus de paramètre `expectedCurrency`).
  - `format.ts` : `formatPrice(cents: number, currency: number): string`.

- [ ] **Step 1 : tests en échec**
  - `currency.test.ts` : `currencyCode(3) === "EUR"`, `currencyCode(1) === "USD"`, `currencyCode(999) === null`.
  - `market.test.ts` : remplacer « rejects prices in another currency » par « fetchOrderBook returns the currency Steam used » (`eCurrency: 1` → `currency: 1`) et « fetchOrderBook rejects a currency it cannot display » (`eCurrency: 999` → rejet `/unsupported currency 999/`). Mettre à jour les autres appels (`fetchOrderBook("x", fn)`).
  - `format.test.ts` : `formatPrice(13, 3) === "€0.13"`, `formatPrice(123456, 3) === "€1,234.56"`, `formatPrice(13, 1) === "US$0.13"`.
- [ ] **Step 2 :** Run `npm test` → les nouveaux tests échouent (fonction absente / mauvais résultat).
- [ ] **Step 3 :** implémenter ; montants toujours en centièmes de l'unité (convention Steam), formatés par `Intl.NumberFormat("en-GB", { style: "currency", currency: code })`. Adapter `price-cells.ts` (`formatPrice(cents, item.prices.currency)`).
- [ ] **Step 4 :** Run `npm test` et `npm run typecheck` → verts.
- [ ] **Step 5 :** Commit `Accept the currency Steam returns`.

### Task 3 : Couche base asynchrone (`src/data`)

**Files :**
- Create : `src/data/schema.sql`, `src/data/sql-client.ts`, `src/data/memory-client.ts` (tests uniquement), `src/data/store.ts`, `src/data/store.test.ts`

**Interfaces :**
- Consumes : `Item` (`src/core/inventory.ts`), `BoardItem`, `Prices` (`src/core/items.ts`), `OrderBookPrices` (tâche 2).
- Produces :
  - `sql-client.ts` : `interface SqlClient { execute(sql: string, params?: unknown[]): Promise<void>; select<T>(sql: string, params?: unknown[]): Promise<T[]> }`. Paramètres SQL écrits `$1, $2…` (convention de `tauri-plugin-sql` pour SQLite).
  - `memory-client.ts` : `createMemoryClient(): SqlClient` (better-sqlite3 `:memory:`, exécute `schema.sql`, convertit `$N` en `?N`).
  - `schema.sql` : tables `items` (colonnes actuelles, dont `app_id`), `prices` (+ colonne `currency INTEGER NOT NULL`), `meta`. Partagé avec la migration Rust (tâche 4).
  - `store.ts` :
    - `saveInventory(db: SqlClient, items: Item[], fetchedAt: string, steamId: string): Promise<void>`
    - `loadInventory(db: SqlClient): Promise<{ items: BoardItem[]; fetchedAt: string | null }>`
    - `loadItem(db: SqlClient, marketHashName: string): Promise<BoardItem | null>`
    - `savePrices(db: SqlClient, marketHashName: string, prices: OrderBookPrices, fetchedAt: string): Promise<void>`
    - `getSetting(db: SqlClient, key: "steam_id"): Promise<string | null>` / `setSetting(db, key, value): Promise<void>`
    - `inventoryIsStale(db: SqlClient, steamId: string): Promise<boolean>` (vrai si jamais récupéré ou récupéré pour un autre SteamID ; clé méta `inventory_steam_id`).

- [ ] **Step 1 : tests en échec** (`store.test.ts`) : reprendre les tests de `src/server/db.test.ts` (`git show 7de8b4a:src/server/db.test.ts`) en asynchrone (aller-retour avec `appId`, remplacement, prix attachés, prix conservés au rafraîchissement, prix avec `currency`), plus :
  - « saveInventory stores 3,000 items » : 3 000 objets distincts → `loadInventory` en renvoie 3 000.
  - « an interrupted save leaves the cache stale » : enregistrer, puis simuler une interruption (supprimer les lignes `items` et la clé `inventory_fetched_at` comme le fait le début de `saveInventory`) → `inventoryIsStale(db, id) === true`.
  - « inventoryIsStale when fetched for another SteamID ».
  - « settings round-trip the SteamID » (`null` puis la valeur enregistrée).
- [ ] **Step 2 :** Run `npm test` → échec (module absent).
- [ ] **Step 3 :** implémenter. `saveInventory` sans transaction (le plugin n'en offre pas sur plusieurs appels) : d'abord supprimer `inventory_fetched_at`, puis `DELETE FROM items`, puis des `INSERT` multi-lignes par paquets de 500 objets, enfin écrire `inventory_fetched_at` et `inventory_steam_id`. Un enregistrement interrompu laisse donc un cache périmé.
- [ ] **Step 4 :** Run `npm test` et `npm run typecheck` → verts.
- [ ] **Step 5 :** Commit `Add async SQLite store behind a SqlClient interface`.

### Task 4 : Coquille Tauri

**Files :**
- Create : `src-tauri/` (via `npx tauri init`, puis édition) : `Cargo.toml`, `tauri.conf.json`, `capabilities/default.json`, `src/lib.rs`, `src/main.rs`, `icons/` ; icône source `src-tauri/app-icon.svg` (motif 2 × 2 carreaux).
- Modify : `package.json` (devDependency `@tauri-apps/cli`, script `"tauri": "tauri"`), `.gitignore` (`src-tauri/target/`).

**Interfaces :**
- Consumes : `src/data/schema.sql` (tâche 3), inclus côté Rust par `include_str!`.
- Produces : base `sqlite:steam-inventory-board.db` migrée au démarrage (migration version 1 = `schema.sql`, déclarée dans `tauri.conf.json` `plugins.sql.preload`) ; plugins `sql`, `http`, `opener` enregistrés ; fenêtre `main`.

- [ ] **Step 1 :** installer `@tauri-apps/cli` v2, `npx tauri init` (frontend dist `../dist/web`, dev URL Vite `http://localhost:5173`, commandes `npm run dev` / `npm run build`). Run : `npx tauri --version` → 2.x.
- [ ] **Step 2 :** ajouter les crates `tauri-plugin-sql` (feature `sqlite`), `tauri-plugin-http` (sans la feature `cookies` si elle est par défaut), `tauri-plugin-opener`, et les paquets npm correspondants ; enregistrer les plugins et la migration dans `lib.rs`.
- [ ] **Step 3 :** `capabilities/default.json` : `sql:default` + `sql:allow-execute`, `http:default` avec `allow` limité aux deux URL des contraintes globales, `opener:allow-open-url` limité à `https://steamcommunity.com/*`. `tauri.conf.json` : titre « Steam Inventory Board », largeur 1440, hauteur 900, minimum 900 × 600, CSP `default-src 'self'; img-src 'self' https://community.fastly.steamstatic.com; style-src 'self' 'unsafe-inline'; font-src 'self'`. Icônes générées par `npx tauri icon src-tauri/app-icon.svg`.
- [ ] **Step 4 :** Run : `npx tauri build --debug` → compilation réussie, `src-tauri/target/debug/steam-inventory-board.exe` existe ; le lancer : la fenêtre s'ouvre sur la page (le tableau reste vide, le câblage arrive en tâche 5).
- [ ] **Step 5 :** Commit `Add the Tauri shell with sql, http and opener plugins`.

### Task 5 : Orchestration dans l'app (`src/app/board.ts`) et câblage de la page

**Files :**
- Create : `src/app/board.ts`, `src/app/board.test.ts`, `src/app/tauri.ts` (création du `SqlClient` sur `Database.load` et export du `fetch` du plugin http)
- Modify : `src/web/main.ts` (plus de `fetch("/api/...")`), `src/core/prices.ts` + test (`describePriceError(error: unknown): string`)

**Interfaces :**
- Consumes : `store.ts` (tâche 3), `fetchInventory`, `groupItems`, `InventoryError`, `fetchOrderBook`, `RateLimitError`, `MarketQueue` (`src/core`).
- Produces :
  - `createBoard(deps: { db: SqlClient; fetchFn: FetchFn; queue: MarketQueue; now?: () => Date }): Board`
  - `interface Board { load(): Promise<{ items: BoardItem[]; fetchedAt: string | null; steamId: string | null }>; refreshInventory(): Promise<{ items: BoardItem[]; fetchedAt: string | null; steamId: string | null }>; fetchPrices(marketHashName: string): Promise<BoardItem>; setSteamId(steamId: string): Promise<void> }`
  - `refreshInventory` rejette `InventoryError` ; `fetchPrices` rejette `Error("Unknown item")`, `Error("This item cannot be sold on the market")`, `RateLimitError` ou l'erreur Steam.
  - `describePriceError(error)` : `RateLimitError` → « Steam is rate limiting requests, try again later », sinon « Failed: <message> ».

- [ ] **Step 1 : tests en échec** (`board.test.ts`, client mémoire + `fetch` factice + file avec horloge factice), repris de `src/server/app.test.ts` et `prices-route.test.ts` (commit `7de8b4a`) : chargement du cache, rafraîchissement qui enregistre et renvoie, échec qui garde le cache, prix enregistrés et renvoyés, objet inconnu et non vendable refusés sans appel, deux demandes simultanées → un seul appel, 429 → `RateLimitError`. Plus : « fetchPrices for an item removed by an inventory refresh rejects Unknown item ». `prices.test.ts` adapté à `describePriceError(error)`.
- [ ] **Step 2 :** Run `npm test` → échecs attendus.
- [ ] **Step 3 :** implémenter `board.ts` (inventaire demandé avec `fetchInventory(steamId, "english", fetchFn)` ; `refreshInventory` rejette si aucun SteamID n'est enregistré), puis `tauri.ts`, puis remplacer dans `main.ts` les trois `fetch` vers `/api` par `board.load()`, `board.refreshInventory()` et `board.fetchPrices()`. Les erreurs d'inventaire passent par `describeInventoryError(error.reason, …)` comme aujourd'hui.
- [ ] **Step 4 :** Run `npm test`, `npm run typecheck` → verts. Run `npx tauri dev` avec un SteamID inscrit provisoirement dans la base (`setSetting`) : le tableau se charge, un clic sur « Get prices » affiche les prix avec leur devise (1 requête au marché).
- [ ] **Step 5 :** Commit `Run inventory and price logic inside the app`.

### Task 6 : Ouvrir les liens dans le navigateur

**Files :**
- Modify : `src/web/rows.ts`, `src/web/main.ts`

**Interfaces :**
- Consumes : `openUrl` de `@tauri-apps/plugin-opener`.

- [ ] **Step 1 :** dans `main.ts`, un seul écouteur `click` délégué sur `#rows` : pour un `a[href^="https://steamcommunity.com/"]`, `preventDefault()` puis `openUrl(href)`. Les liens gardent `href` (survol, accessibilité).
- [ ] **Step 2 :** Run `npm run typecheck`. Vérification manuelle dans `npx tauri dev` : le nom d'un objet vendable ouvre sa page du marché dans le navigateur par défaut ; l'icône 2 × 2 ouvre la page de badge ; la fenêtre de l'app ne navigue pas.
- [ ] **Step 3 :** Commit `Open Steam links in the default browser`.

### Task 7 : Écran de réglages et SteamID

**Files :**
- Create : `src/core/steam-id.ts`, `src/core/steam-id.test.ts`, `src/web/settings.ts`
- Modify : `src/web/index.html` (section réglages, icône réglages dans l'en-tête), `src/web/main.ts`, `src/web/icons.ts` (icône engrenage), `src/web/style.css`

**Interfaces :**
- Consumes : `board.setSteamId`, `board.load`, `board.refreshInventory` (tâche 5) ; `inventoryIsStale` via le board.
- Produces : `parseSteamId(input: string): { steamId: string } | { error: string }`.

- [ ] **Step 1 : tests en échec** (`steam-id.test.ts`) :
  - `parseSteamId("76561198078288325")` → `{ steamId: "76561198078288325" }`
  - `parseSteamId("  76561198078288325 ")` → même résultat
  - `parseSteamId("https://steamcommunity.com/id/realjck")` → `{ error: "Enter the 17-digit SteamID64, not a profile URL." }`
  - `parseSteamId("12345")` → `{ error: "A SteamID64 has exactly 17 digits." }`
- [ ] **Step 2 :** Run `npm test` → échec (module absent).
- [ ] **Step 3 :** implémenter `parseSteamId`, puis l'écran : au démarrage, sans SteamID enregistré, afficher les réglages à la place du tableau (champ, bouton « Save », message d'erreur sous le champ, texte d'aide « Find it on your Steam profile page or with a SteamID lookup site. ») ; icône engrenage dans l'en-tête pour y revenir ; à l'enregistrement : `setSteamId`, puis rafraîchissement de l'inventaire si `inventoryIsStale`, puis retour au tableau. Un inventaire privé affiche le message existant dans l'écran de réglages.
- [ ] **Step 4 :** Run `npm test`, `npm run typecheck`. Vérification dans `npx tauri dev` avec une base vide : écran de réglages, `12345` refusé, ton SteamID accepté → tableau ; changement vers `76561197960265728` → message d'inventaire privé, tableau précédent conservé.
- [ ] **Step 5 :** Commit `Add a settings screen for the SteamID`.

### Task 8 : Documenter et livrer l'exécutable

**Files :**
- Delete : `.env.example` ; l'utilisateur supprime son `.env` et `data/` à sa convenance.
- Modify : `package.json` (script `recon` avec un SteamID passé en argument), `scripts/recon.ts` (lit le SteamID dans `process.argv[2]`), `README.md`, `SPEC.md` (architecture, configuration, sources de données : devise, lancement).

- [ ] **Step 1 :** mises à jour. Run : `npm test`, `npm run typecheck` → verts ; `grep -rE "src/server|fastify|/api/|\.env" src scripts README.md` → aucun résultat.
- [ ] **Step 2 :** Run : `npx tauri build` → `src-tauri/target/release/steam-inventory-board.exe` et l'installeur NSIS dans `src-tauri/target/release/bundle/nsis/`.
- [ ] **Step 3 :** vérifier les critères d'acceptation du cadrage avec l'exe de release : premier lancement → réglages ; second lancement → tableau en moins de 2 s sans appel réseau ; changement de SteamID → inventaire rechargé, prix conservés ; 20 clics rapides sur « Get prices » → requêtes espacées d'au moins 3 s (horodatages des prix) ; liens ouverts dans le navigateur.
- [ ] **Step 4 :** Commit `Document and ship the desktop app`.

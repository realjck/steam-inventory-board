# Spec : Steam Inventory Board (v1)

## Objectif

Outil local qui affiche tout mon inventaire communautaire Steam (cartes, fonds, émoticônes, boosters, gemmes) dans **un seul tableau** :

- filtrable comme sur l'interface Steam ;
- avec les doublons regroupés ;
- avec le prix de vente et le prix d'achat de chaque objet, **obtenus à la demande**, ligne par ligne.

**Langue de l'interface : anglais** (textes, formats `en-GB` : « €0.13 », « 2,608 », dates jour/mois en 24 h ; données Steam demandées en `english`).

Usage personnel, lecture seule. Aucune action sur le compte : pas de vente, pas d'échange, pas de login Steam.

## Périmètre v1

### Inclus

- **Inventaire.** Appid `753`, contextid `6` (objets de la communauté Steam).
- **Tableau.** Une ligne par objet distinct, avec les colonnes suivantes :
  - image
  - nom
  - jeu
  - type
  - rareté
  - carte brillante (oui/non)
  - quantité possédée
  - échangeable
  - vendable
  - prix de vente le plus bas
  - meilleur prix d'achat (buy order)

  Pas de prix médian ni de volume : pour le détail, on passe par le lien vers le marché.
- **Titre.** « Real's inventory (realjck) » : pseudo Steam, puis le nom de l'URL personnalisée en petit sur la même ligne (absent s'il n'y en a pas). Lus dans `https://steamcommunity.com/profiles/{STEAM_ID64}?xml=1` (champs `steamID` et `customURL`) à chaque rafraîchissement de l'inventaire ; si le profil est illisible, « My Steam inventory ». Le bouton des réglages (icône engrenage) est en haut à gauche, devant le titre.
- **Lien collection.** Première colonne : une icône SVG (2 × 2 carreaux) qui ouvre, dans un nouvel onglet, la page de badge du jeu de l'objet pour mon compte : `https://steamcommunity.com/profiles/{STEAM_ID64}/gamecards/{appid}` (Steam redirige vers l'URL personnalisée). L'appid vient du tag `Game` (`app_{appid}`). Pas d'icône pour les objets rattachés à Steam lui-même (appid 753, ex. gemmes).
- **Lien marché.** Le nom de l'objet est un lien cliquable (nouvel onglet) vers sa page du marché Steam : `https://steamcommunity.com/market/listings/753/{market_hash_name encodé}`. Objet non vendable : pas de lien.
- **Filtres.**
  - Recherche texte, portant sur le nom de l'objet **et** le nom du jeu (pas de filtre dédié au jeu).
  - Type d'objet.
  - Rareté.
  - Brillante.
  - Échangeable ou vendable.
  - « Duplicates » : doublons uniquement (quantité ≥ 2).
- **Tri et totaux.** Tri sur toutes les colonnes ; sur une colonne de prix, les objets sans prix sont toujours en fin de liste. Pied de tableau : une seule mention, fixe au défilement horizontal, « 2,608 unique items (Total 2,994) » (« 61 of 2,608 unique items (Total 447) » quand des filtres masquent des objets). Pas de valeur totale.
- **Prix à la demande.** Voir section 2.
- **Rafraîchissement de l'inventaire.** Un bouton (même icône SVG que le rafraîchissement des prix, sans texte), avec l'horodatage de la dernière mise à jour. Il n'y a pas de rafraîchissement global des prix.

### Hors périmètre v1

- Vente, échanges, offres.
- Multi-comptes.
- Inventaires de jeux (CS2, TF2…).
- Progression des badges et sets incomplets (piste v2).
- Récupération des prix en masse.

## Configuration

Un seul réglage, saisi dans l'écran de réglages de l'application (affiché au premier lancement, puis accessible depuis l'en-tête) : le **SteamID64** (17 chiffres). Un nouveau SteamID n'est conservé que si son inventaire se charge. Données Steam demandées en anglais ; la devise est celle que Steam renvoie.

L'inventaire doit être **public**.

## Sources de données

> Ces endpoints sont non documentés par Valve. Ils ont été vérifiés par le script de reconnaissance (`npm run recon`, réponses brutes dans `samples/`) le 28/10/2026.

### 1. Inventaire

`GET https://steamcommunity.com/inventory/{STEAM_ID64}/753/6?l=english&count=2000`

- La réponse contient `assets[]` et `descriptions[]`, liés par `classid` + `instanceid`.
- **Pagination.** Tant que `more_items` est présent, rappeler l'endpoint avec `start_assetid={last_assetid}`.
- **Limite.** `count` vaut au maximum 2000 : au-delà, Steam plafonne à 2000 ; à 5000, il répond HTTP 400.
- **Doublons.** Regrouper les assets par `market_hash_name` (toujours présent ; un même nom peut correspondre à plusieurs `classid`/`instanceid`). Quantité = somme des `amount`.
- **Filtres.** Les valeurs viennent de `descriptions[].tags[]` ; afficher `localized_tag_name` (données demandées en anglais) :
  - `item_class` : type (Trading Card, Profile Background, Emoticon, Booster Pack, Gems, etc.) ;
  - `droprate` : rareté (Common, Uncommon, Rare ; la couleur de la pastille dépend de ces libellés) ;
  - `cardborder` : `cardborder_1` (Foil) = brillante ;
  - `Game` : nom du jeu, `internal_name` = `app_{appid}`.
- **Statut.** `tradable` et `marketable` sont dans `descriptions[]`.

### 2. Prix de vente et d'achat (carnet d'ordres)

`GET https://steamcommunity.com/market/orderbook?q=Load&qp=[753,"{market_hash_name}"]`, avec l'en-tête `x-valve-request-type: queryAction`.

- C'est l'appel que fait le site du marché (refonte React) lui-même. Réponse : `{ data: { success, data: { amtMaxBuyOrder, amtMinSellOrder, eCurrency, ... } } }`.
- `amtMinSellOrder` = prix de vente le plus bas, `amtMaxBuyOrder` = meilleur prix d'achat, en centimes.
- **Devise.** Choisie par Steam (selon l'IP), pas par paramètre. `eCurrency` est enregistré avec les prix et affiché via la table des codes devise Steam (ISO 4217) ; un code inconnu : rien n'est enregistré et une erreur s'affiche. Montants en centièmes de l'unité.
- Une seule requête par objet pour les deux prix.

**Abandonnés** (constaté à la reconnaissance) :

- `itemordershistogram` : `item_nameid` n'apparaît plus dans les pages du marché.
- `search/render` : 10 résultats par page maximum, prix en USD quelle que soit la devise demandée.
- `priceoverview` : fonctionne, mais n'apporte que le médian et le volume, exclus du tableau.

**Chargement à la demande uniquement.** Aucun appel au marché n'est fait au démarrage ni en arrière-plan. La cellule de prix d'une ligne a trois états :

- **Jamais chargé.** Un bouton récupère les deux prix pour cet objet uniquement : icône SVG (flèche de téléchargement) suivie du texte « Get prices ».
- **En cache.** La cellule affiche les prix, la date de dernière mise à jour (ex. « €0.13 » et « 28/10 14:32 ») et un bouton de rafraîchissement : icône SVG (flèche circulaire), sans texte, avec `title` et `aria-label` « Refresh prices ».
- **En cours ou en erreur.** Un indicateur de chargement « Loading » (ou « Queued » si d'autres demandes passent avant), ou un message d'erreur avec possibilité de réessayer.

Les prix en cache s'affichent dès le démarrage. Si un prix est vieux, c'est la date affichée qui le signale.

## Contraintes critiques

- **Rate limit du marché.** Valeur exacte inconnue ; elle n'est pas mesurée volontairement, pour ne pas risquer de blocage. Même si les appels sont manuels, plusieurs clics rapprochés passent par :
  - une file d'attente avec throttle configurable (défaut : 1 requête / 3 s) ;
  - un backoff exponentiel sur HTTP 429 ;
  - jamais d'appels au marché en parallèle.
- **Base locale SQLite** (plugin `tauri-plugin-sql`), fichier unique dans le dossier de données de l'application (`%APPDATA%\com.realjck.steaminventoryboard\`). Elle stocke :
  - l'inventaire, avec le SteamID pour lequel il a été récupéré ;
  - les prix (vente et achat), sans TTL, avec leur devise et leur horodatage `fetched_at` ;
  - le SteamID saisi dans les réglages.
- **Démarrage instantané.** Le tableau s'affiche immédiatement depuis SQLite. L'inventaire n'est récupéré automatiquement que s'il n'a jamais été récupéré pour le SteamID enregistré (premier lancement, changement de compte, enregistrement interrompu) ; sinon, seulement via le bouton.
- **Objets non vendables.** Pas de bouton ni de requête de prix ; afficher « — ».
- **Aucun ordre en cours.** Si `amtMinSellOrder` ou `amtMaxBuyOrder` est absent, afficher « — » pour ce prix.
- **CORS.** Steam n'autorise pas les appels depuis un navigateur : ils passent par le plugin `tauri-plugin-http` (côté Rust), limité aux URL de l'inventaire, du carnet d'ordres et du profil XML, sans cookies, et sans en-tête `Origin` (le carnet d'ordres répond 401 à l'origine de l'application).

## Architecture

Application de bureau Tauri v2 (cadrage : `docs/superpowers/specs/2026-10-28-tauri-desktop-design.md`) :

- `src/core` : logique pure (regroupement de l'inventaire, carnet d'ordres et devises, file d'attente, filtres, tri, formats, messages).
- `src/data` : cache SQLite derrière une interface `SqlClient` (plugin SQL dans l'app, better-sqlite3 en mémoire dans les tests).
- `src/app` : services de l'application (inventaire, prix à la demande, SteamID) et branchement des plugins Tauri.
- `src/web` : interface (tableau, réglages), Vite + TypeScript sans framework.
- `src-tauri` : coquille Rust (plugins sql, http, opener ; migration ; permissions ; CSP).
- **Lancement.** `steam-inventory-board.exe` (ou l'installeur NSIS) ; en développement, `npm run tauri dev`.

## Jalons

1. ~~**Script de reconnaissance.**~~ Fait (voir « Sources de données »).
2. ~~Fetch de l'inventaire, regroupement des doublons, cache SQLite, `GET /api/items`.~~ Fait.
3. ~~Tableau, filtres, tri, totaux, lien marché (sans prix).~~ Fait.
4. ~~Prix à la demande : bouton par ligne, file d'attente, throttle, backoff, cache SQLite, date affichée.~~ Fait, avec le lien collection.
5. ~~Gestion des erreurs et finitions (états d'attente, erreurs de devise, inventaire privé).~~ Fait : message dédié pour un inventaire privé ou introuvable (HTTP 403/404) et pour la limite de requêtes d'inventaire (429), focus clavier conservé pendant une demande de prix.

## Critères d'acceptation

- Au second lancement, le tableau s'affiche en moins de 2 s depuis le cache.
- Aucun appel au marché sans clic de l'utilisateur.
- Le filtre « doublons » liste exactement les objets dont la quantité est ≥ 2.
- Cliquer rapidement sur le bouton « Get prices » de 20 lignes n'envoie jamais deux requêtes marché à moins de 3 s d'intervalle, et aucun 429 n'est laissé sans gestion.
- Les prix sont affichés en euros, avec la date de dernière mise à jour par ligne.
- Des prix obtenus au clic sont toujours présents, avec leur date, après redémarrage.
- La recherche « Portal » trouve tous les objets du jeu Portal.
- Le nom d'un objet vendable ouvre sa page du marché Steam.
- Aucun identifiant ni cookie Steam n'est requis ni stocké.

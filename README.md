# Steam Inventory Board

Local, read-only board of a public Steam community inventory (cards, backgrounds, emoticons, boosters, gems): one sortable, filterable table with duplicates grouped and a link to each item's market page. See [SPEC.md](SPEC.md) (French) for the full specification.

## Setup

Requires Node 22.18+ (runs TypeScript natively).

```sh
npm install
cp .env.example .env   # then set STEAM_ID64; the inventory must be public
npm start              # builds the page, then serves http://localhost:3000
```

The first start fetches the inventory from Steam and caches it in `data/`. Later starts read the cache; use the refresh button to fetch it again.

Prices are never fetched automatically: each row has a button that fetches its lowest sell and highest buy price. Market requests go through a queue (one every `MARKET_INTERVAL_MS`, 3000 by default) that backs off on HTTP 429. `PORT` (default 3000) is optional too.

## Scripts

- `npm test`: unit tests (`node:test`)
- `npm run typecheck`: TypeScript check
- `npm run dev`: Vite dev server with hot reload (run `npm start` alongside for the API)
- `npm run recon`: re-checks the undocumented Steam endpoints and saves raw responses to `samples/`

# Steam Inventory Board

Windows desktop app (Tauri) that shows a public Steam community inventory (cards, backgrounds, emoticons, boosters, gems) in one sortable, filterable table: duplicates grouped, links to each item's market page and to your badge page, and lowest sell / highest buy prices fetched on demand. Read-only, no Steam login. See [SPEC.md](SPEC.md) (French) for the full specification.

## Use

Run `steam-inventory-board.exe` (or the `*-setup.exe` installer), then enter your SteamID64 in the settings screen. The inventory must be public.

The inventory is cached in a SQLite file in `%APPDATA%\com.realjck.steaminventoryboard\`. Later starts show it at once; the refresh button fetches it again. Prices are never fetched automatically: each row has a button, and market requests go through a queue (one every 3 s, backing off on HTTP 429).

## Develop

Requires Node 22.18+ (runs TypeScript natively) and the Rust toolchain.

```sh
npm install
npm run tauri dev     # app window with hot reload
npm run tauri build   # src-tauri/target/release/steam-inventory-board.exe + NSIS installer
```

- `npm test`: unit tests (`node:test`; the store runs against an in-memory SQLite)
- `npm run typecheck`: TypeScript check
- `npm run recon -- <SteamID64>`: re-checks the undocumented Steam endpoints and saves raw responses to `samples/`

Layout: `src/core` pure logic, `src/data` SQLite store, `src/app` app services (Steam calls, queue, Tauri plugins), `src/web` interface, `src-tauri` Rust shell (plugins, migration, permissions).

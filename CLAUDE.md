# CLAUDE.md

## Languages

- Code, comments, README and commit messages: English.
- Interface: English, `en-GB` formats (€0.13, 2,608, 28/10 14:32).
- Design docs and plans in `docs/superpowers/`: French.

## Steam requests (hard rules)

- Never call the Steam market without a user click. Every price request goes through `MarketQueue` (one at a time, 3 s apart, back-off on 429).
- No test or loop may hit Steam: tests use fake `fetch` functions. `npm run recon -- <SteamID64>` makes real requests; run it only when asked.
- A new Steam URL must also be allowed in `src-tauri/capabilities/default.json` (HTTP scope), or the app refuses it.
- Keep `Origin: ""` in `steamFetch` (`src/app/tauri.ts`): the market order book answers 401 to the app's origin.

## Pitfalls

- Tauri plugins reject with plain strings, not `Error`: read messages with `errorMessage()` (`src/core/messages.ts`).
- In tests, better-sqlite3 binds the store's `$N` placeholders by name (`src/data/memory-client.ts`).
- `src/data/schema.sql` is migration 1, checksummed by the SQL plugin: never edit it, not even its line endings (`.gitattributes` forces LF), or existing databases make the app panic at startup. Schema changes go in a new migration.
- The user's real cache is `%APPDATA%\com.realjck.steaminventoryboard\steam-inventory-board.db`: never delete it to test.

## Checking the real app

The Tauri window cannot be driven by the Chrome extension. Build (`npx tauri build --debug`), launch the exe with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, then evaluate scripts or take screenshots through the DevTools protocol (`http://127.0.0.1:9222/json`).

## Before each commit

`npm test` and `npm run typecheck` must pass; rebuild with `npm run tauri build` when `src-tauri/` or the interface changed.

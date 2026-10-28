/** Entry point: npm start, then open http://localhost:3000. */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { buildApp } from "./app.ts";
import { openDatabase, loadInventory } from "./db.ts";
import { fetchInventory } from "./inventory.ts";
import { fetchOrderBook } from "./market.ts";
import { MarketQueue } from "./queue.ts";

const BACKOFF_MS = 30_000;
const MAX_RETRIES = 3;

function readSteamId(): string {
  const steamId = process.env.STEAM_ID64 ?? "";
  if (!/^\d{17}$/.test(steamId)) throw new Error("STEAM_ID64 must be a 17-digit SteamID64 (see .env.example)");
  return steamId;
}

function readInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

const steamId = readSteamId();
const language = process.env.LANGUAGE ?? "english";
const port = readInteger("PORT", 3000);
const currency = readInteger("CURRENCY", 3);
const queue = new MarketQueue({
  intervalMs: readInteger("MARKET_INTERVAL_MS", 3000),
  backoffMs: BACKOFF_MS,
  maxRetries: MAX_RETRIES,
});

mkdirSync("data", { recursive: true });
const db = openDatabase("data/inventory.db");
const app = buildApp({
  db,
  fetchPages: () => fetchInventory(steamId, language),
  fetchPrices: (marketHashName) => queue.run(() => fetchOrderBook(marketHashName, currency)),
  steamId,
  webRoot: resolve("dist/web"),
});

if (loadInventory(db).fetchedAt === null) {
  console.log("Empty cache: fetching inventory from Steam...");
  const res = await app.inject({ method: "POST", url: "/api/refresh/inventory" });
  console.log(res.statusCode === 200 ? "Inventory cached." : `Inventory fetch failed: ${res.body}`);
}

await app.listen({ port, host: "127.0.0.1" });
console.log(`Steam Inventory Board on http://localhost:${port}`);

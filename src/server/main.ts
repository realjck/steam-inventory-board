/** Entry point: npm start, then open http://localhost:3000. */
import { mkdirSync } from "node:fs";
import { buildApp } from "./app.ts";
import { openDatabase, loadInventory } from "./db.ts";
import { fetchInventory } from "./inventory.ts";

const PORT = 3000;

function readSteamId(): string {
  const steamId = process.env.STEAM_ID64 ?? "";
  if (!/^\d{17}$/.test(steamId)) throw new Error("STEAM_ID64 must be a 17-digit SteamID64 (see .env.example)");
  return steamId;
}

const steamId = readSteamId();
const language = process.env.LANGUAGE ?? "french";

mkdirSync("data", { recursive: true });
const db = openDatabase("data/inventory.db");
const app = buildApp({ db, fetchPages: () => fetchInventory(steamId, language) });

if (loadInventory(db).fetchedAt === null) {
  console.log("Empty cache: fetching inventory from Steam...");
  const res = await app.inject({ method: "POST", url: "/api/refresh/inventory" });
  console.log(res.statusCode === 200 ? "Inventory cached." : `Inventory fetch failed: ${res.body}`);
}

await app.listen({ port: PORT, host: "127.0.0.1" });
console.log(`Steam Inventory Board on http://localhost:${PORT}`);

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./app.ts";
import { openDatabase, saveInventory } from "./db.ts";
import type { InventoryPage, Item } from "./inventory.ts";

const NOW = new Date("2026-10-28T14:32:00.000Z");

const page: InventoryPage = {
  assets: [{ assetid: "10", classid: "1", instanceid: "0", amount: "2" }],
  descriptions: [
    {
      classid: "1",
      instanceid: "0",
      name: "Sól",
      market_hash_name: "281750-Sól",
      type: "Munin Trading Card",
      icon_url: "icon",
      tradable: 1,
      marketable: 1,
      tags: [],
    },
  ],
};

function setup(fetchPages: () => Promise<InventoryPage[]> = async () => [page]) {
  const db = openDatabase(":memory:");
  const app = buildApp({ db, fetchPages, now: () => NOW });
  return { db, app };
}

test("GET /api/items returns the cached inventory", async (t) => {
  const { db, app } = setup();
  t.after(() => app.close());
  const gems: Item = {
    marketHashName: "753-Gems",
    name: "Gemmes",
    game: "Steam",
    type: "Gemmes",
    rarity: "commun",
    foil: false,
    quantity: 3,
    tradable: true,
    marketable: false,
    iconUrl: "icon",
  };
  saveInventory(db, [gems], "2026-10-27T09:00:00.000Z");

  const res = await app.inject({ method: "GET", url: "/api/items" });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().fetchedAt, "2026-10-27T09:00:00.000Z");
  assert.deepEqual(res.json().items.map((i: Item) => i.marketHashName), ["753-Gems"]);
});

test("POST /api/refresh/inventory fetches, caches and returns the new inventory", async (t) => {
  const { app } = setup();
  t.after(() => app.close());

  const res = await app.inject({ method: "POST", url: "/api/refresh/inventory" });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().fetchedAt, NOW.toISOString());
  assert.equal(res.json().items[0].quantity, 2);
  const cached = await app.inject({ method: "GET", url: "/api/items" });
  assert.deepEqual(cached.json(), res.json());
});

test("POST /api/refresh/inventory answers 502 and keeps the cache when Steam fails", async (t) => {
  const { db, app } = setup(async () => {
    throw new Error("Inventory request failed: HTTP 403");
  });
  t.after(() => app.close());
  saveInventory(db, [], "2026-10-27T09:00:00.000Z");

  const res = await app.inject({ method: "POST", url: "/api/refresh/inventory" });

  assert.equal(res.statusCode, 502);
  assert.match(res.json().error, /HTTP 403/);
  const cached = await app.inject({ method: "GET", url: "/api/items" });
  assert.equal(cached.json().fetchedAt, "2026-10-27T09:00:00.000Z");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryClient } from "./memory-client.ts";
import {
  getSetting,
  inventoryIsStale,
  loadInventory,
  loadItem,
  saveInventory,
  savePrices,
  setSetting,
} from "./store.ts";
import type { Item } from "../core/inventory.ts";

const STEAM_ID = "76561198078288325";
const OTHER_ID = "76561197960265728";

function item(overrides: Partial<Item>): Item {
  return {
    marketHashName: "281750-Sól",
    name: "Sól",
    game: "Munin",
    appId: 281750,
    type: "Trading Card",
    rarity: "Common",
    foil: false,
    quantity: 2,
    tradable: true,
    marketable: true,
    iconUrl: "https://example.test/icon",
    ...overrides,
  };
}

test("loadInventory is empty with no fetch date on a new database", async () => {
  const db = createMemoryClient();

  assert.deepEqual(await loadInventory(db), { items: [], fetchedAt: null });
});

test("saveInventory round-trips items and their fetch date", async () => {
  const db = createMemoryClient();
  const items = [item({}), item({ marketHashName: "753-Gems", game: null, appId: null, rarity: null, foil: true, tradable: false })];

  await saveInventory(db, items, "2026-10-28T14:32:00.000Z", STEAM_ID);

  assert.deepEqual(await loadInventory(db), {
    items: items.map((i) => ({ ...i, prices: null })),
    fetchedAt: "2026-10-28T14:32:00.000Z",
  });
});

test("saveInventory replaces the previous inventory", async () => {
  const db = createMemoryClient();
  await saveInventory(db, [item({ marketHashName: "sold-item" })], "2026-10-27T10:00:00.000Z", STEAM_ID);

  await saveInventory(db, [item({})], "2026-10-28T10:00:00.000Z", STEAM_ID);

  assert.deepEqual((await loadInventory(db)).items.map((i) => i.marketHashName), ["281750-Sól"]);
});

test("saveInventory stores 3,000 items", async () => {
  const db = createMemoryClient();
  const items = Array.from({ length: 3000 }, (_, i) => item({ marketHashName: `1-item-${i}` }));

  await saveInventory(db, items, "2026-10-28T10:00:00.000Z", STEAM_ID);

  assert.equal((await loadInventory(db)).items.length, 3000);
});

test("savePrices attaches prices, currency and fetch date to the item", async () => {
  const db = createMemoryClient();
  await saveInventory(db, [item({})], "2026-10-28T10:00:00.000Z", STEAM_ID);

  await savePrices(db, "281750-Sól", { sell: 13, buy: null, currency: 3 }, "2026-10-28T14:32:00.000Z");

  assert.deepEqual((await loadItem(db, "281750-Sól"))?.prices, {
    sell: 13,
    buy: null,
    currency: 3,
    fetchedAt: "2026-10-28T14:32:00.000Z",
  });
});

test("savePrices replaces the previous prices of the item", async () => {
  const db = createMemoryClient();
  await saveInventory(db, [item({})], "2026-10-28T10:00:00.000Z", STEAM_ID);
  await savePrices(db, "281750-Sól", { sell: 13, buy: 12, currency: 3 }, "2026-10-28T14:32:00.000Z");

  await savePrices(db, "281750-Sól", { sell: 15, buy: 14, currency: 1 }, "2026-10-29T09:00:00.000Z");

  assert.deepEqual((await loadInventory(db)).items[0].prices, {
    sell: 15,
    buy: 14,
    currency: 1,
    fetchedAt: "2026-10-29T09:00:00.000Z",
  });
});

test("prices survive an inventory refresh", async () => {
  const db = createMemoryClient();
  await saveInventory(db, [item({})], "2026-10-28T10:00:00.000Z", STEAM_ID);
  await savePrices(db, "281750-Sól", { sell: 13, buy: 12, currency: 3 }, "2026-10-28T14:32:00.000Z");

  await saveInventory(db, [item({ quantity: 3 })], "2026-10-29T10:00:00.000Z", OTHER_ID);

  assert.equal((await loadInventory(db)).items[0].prices?.sell, 13);
});

test("loadItem returns null for an item not in the inventory", async () => {
  const db = createMemoryClient();

  assert.equal(await loadItem(db, "nope"), null);
});

test("inventoryIsStale until an inventory is saved for this SteamID", async () => {
  const db = createMemoryClient();
  assert.equal(await inventoryIsStale(db, STEAM_ID), true);

  await saveInventory(db, [item({})], "2026-10-28T10:00:00.000Z", STEAM_ID);

  assert.equal(await inventoryIsStale(db, STEAM_ID), false);
});

test("inventoryIsStale when fetched for another SteamID", async () => {
  const db = createMemoryClient();
  await saveInventory(db, [item({})], "2026-10-28T10:00:00.000Z", OTHER_ID);

  assert.equal(await inventoryIsStale(db, STEAM_ID), true);
});

test("an interrupted save leaves the cache stale", async () => {
  const db = createMemoryClient();
  await saveInventory(db, [item({})], "2026-10-28T10:00:00.000Z", STEAM_ID);
  // What saveInventory has done when the app closes after its first statements.
  await db.execute("DELETE FROM meta WHERE key = 'inventory_fetched_at'");
  await db.execute("DELETE FROM items");

  assert.equal(await inventoryIsStale(db, STEAM_ID), true);
});

test("settings round-trip the SteamID", async () => {
  const db = createMemoryClient();
  assert.equal(await getSetting(db, "steam_id"), null);

  await setSetting(db, "steam_id", STEAM_ID);

  assert.equal(await getSetting(db, "steam_id"), STEAM_ID);
});

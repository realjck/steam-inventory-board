import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openDatabase, saveInventory, loadInventory, savePrices } from "./db.ts";
import type { Item } from "./inventory.ts";

function item(overrides: Partial<Item>): Item {
  return {
    marketHashName: "281750-Sól",
    name: "Sól",
    game: "Munin",
    appId: 281750,
    type: "Carte à échanger",
    rarity: "commun",
    foil: false,
    quantity: 2,
    tradable: true,
    marketable: true,
    iconUrl: "https://example.test/icon",
    ...overrides,
  };
}

test("loadInventory is empty with no fetch date on a new database", () => {
  const db = openDatabase(":memory:");

  assert.deepEqual(loadInventory(db), { items: [], fetchedAt: null });
});

test("saveInventory round-trips items and their fetch date", () => {
  const db = openDatabase(":memory:");
  const items = [item({}), item({ marketHashName: "753-Gems", game: null, appId: null, rarity: null, foil: true, tradable: false })];

  saveInventory(db, items, "2026-10-28T14:32:00.000Z");

  assert.deepEqual(loadInventory(db), {
    items: items.map((i) => ({ ...i, prices: null })),
    fetchedAt: "2026-10-28T14:32:00.000Z",
  });
});

test("saveInventory replaces the previous inventory", () => {
  const db = openDatabase(":memory:");
  saveInventory(db, [item({ marketHashName: "sold-item" })], "2026-10-27T10:00:00.000Z");

  saveInventory(db, [item({})], "2026-10-28T10:00:00.000Z");

  assert.deepEqual(
    loadInventory(db).items.map((i) => i.marketHashName),
    ["281750-Sól"],
  );
});

test("savePrices attaches prices and their fetch date to the item", () => {
  const db = openDatabase(":memory:");
  saveInventory(db, [item({})], "2026-10-28T10:00:00.000Z");

  savePrices(db, "281750-Sól", { sell: 13, buy: null }, "2026-10-28T14:32:00.000Z");

  assert.deepEqual(loadInventory(db).items[0].prices, { sell: 13, buy: null, fetchedAt: "2026-10-28T14:32:00.000Z" });
});

test("savePrices replaces the previous prices of the item", () => {
  const db = openDatabase(":memory:");
  saveInventory(db, [item({})], "2026-10-28T10:00:00.000Z");
  savePrices(db, "281750-Sól", { sell: 13, buy: 12 }, "2026-10-28T14:32:00.000Z");

  savePrices(db, "281750-Sól", { sell: 15, buy: 14 }, "2026-10-29T09:00:00.000Z");

  assert.deepEqual(loadInventory(db).items[0].prices, { sell: 15, buy: 14, fetchedAt: "2026-10-29T09:00:00.000Z" });
});

test("prices survive an inventory refresh", () => {
  const db = openDatabase(":memory:");
  saveInventory(db, [item({})], "2026-10-28T10:00:00.000Z");
  savePrices(db, "281750-Sól", { sell: 13, buy: 12 }, "2026-10-28T14:32:00.000Z");

  saveInventory(db, [item({ quantity: 3 })], "2026-10-29T10:00:00.000Z");

  assert.equal(loadInventory(db).items[0].prices?.sell, 13);
});

test("openDatabase migrates a cache created before appId and asks for a fresh inventory", () => {
  const path = join(mkdtempSync(join(tmpdir(), "sib-db-")), "old.db");
  const old = new Database(path);
  old.exec(`
    CREATE TABLE items (market_hash_name TEXT PRIMARY KEY, name TEXT NOT NULL, game TEXT, type TEXT, rarity TEXT,
      foil INTEGER NOT NULL, quantity INTEGER NOT NULL, tradable INTEGER NOT NULL, marketable INTEGER NOT NULL,
      icon_url TEXT NOT NULL);
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO items VALUES ('281750-Sól', 'Sól', 'Munin', NULL, NULL, 0, 1, 1, 1, 'icon');
    INSERT INTO meta VALUES ('inventory_fetched_at', '2026-10-28T10:00:00.000Z');
  `);
  old.close();

  const db = openDatabase(path);

  const inventory = loadInventory(db);
  assert.equal(inventory.fetchedAt, null);
  assert.equal(inventory.items[0].appId, null);
  db.close();
});

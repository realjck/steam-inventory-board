import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, saveInventory, loadInventory } from "./db.ts";
import type { Item } from "./inventory.ts";

function item(overrides: Partial<Item>): Item {
  return {
    marketHashName: "281750-Sól",
    name: "Sól",
    game: "Munin",
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
  const items = [item({}), item({ marketHashName: "753-Gems", game: null, rarity: null, foil: true, tradable: false })];

  saveInventory(db, items, "2026-10-28T14:32:00.000Z");

  assert.deepEqual(loadInventory(db), { items, fetchedAt: "2026-10-28T14:32:00.000Z" });
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

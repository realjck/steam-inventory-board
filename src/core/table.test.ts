import { test } from "node:test";
import assert from "node:assert/strict";
import { filterItems, sortItems, computeTotals, NO_FILTERS, type Filters } from "./table.ts";
import type { BoardItem as Item, Prices } from "./items.ts";

function item(overrides: Partial<Item>): Item {
  return {
    marketHashName: overrides.name ?? "item",
    name: "item",
    game: "Munin",
    appId: 281750,
    type: "Carte à échanger",
    rarity: "commun",
    foil: false,
    quantity: 1,
    tradable: true,
    marketable: true,
    iconUrl: "icon",
    prices: null,
    ...overrides,
  };
}

const names = (items: Item[]) => items.map((i) => i.name);
const filter = (items: Item[], filters: Partial<Filters>) => names(filterItems(items, { ...NO_FILTERS, ...filters }));

test("search matches the item name or the game, ignoring case and accents", () => {
  const items = [
    item({ name: "Sól", game: "Munin" }),
    item({ name: "The Lab", game: "Portal 2" }),
    item({ name: "Hugin", game: "Munin" }),
  ];

  assert.deepEqual(filter(items, { search: "sol" }), ["Sól"]);
  assert.deepEqual(filter(items, { search: "PORTAL" }), ["The Lab"]);
  assert.deepEqual(filter(items, { search: "  munin " }), ["Sól", "Hugin"]);
});

test("type and rarity filters keep exact matches only", () => {
  const items = [
    item({ name: "a", type: "Émoticône", rarity: "rare" }),
    item({ name: "b", type: "Émoticône", rarity: "commun" }),
    item({ name: "c", type: "Carte à échanger", rarity: "rare" }),
  ];

  assert.deepEqual(filter(items, { type: "Émoticône" }), ["a", "b"]);
  assert.deepEqual(filter(items, { type: "Émoticône", rarity: "rare" }), ["a"]);
});

test("flag filters keep foil, tradable, marketable or duplicated items", () => {
  const items = [
    item({ name: "foil", foil: true }),
    item({ name: "locked", tradable: false, marketable: false }),
    item({ name: "dup", quantity: 2 }),
  ];

  assert.deepEqual(filter(items, { foilOnly: true }), ["foil"]);
  assert.deepEqual(filter(items, { tradableOnly: true }), ["foil", "dup"]);
  assert.deepEqual(filter(items, { marketableOnly: true }), ["foil", "dup"]);
  assert.deepEqual(filter(items, { duplicatesOnly: true }), ["dup"]);
});

test("sortItems orders text ignoring accents and case, in both directions", () => {
  const items = [item({ name: "Émeraude" }), item({ name: "zèbre" }), item({ name: "Ambre" })];

  assert.deepEqual(names(sortItems(items, "name", "asc")), ["Ambre", "Émeraude", "zèbre"]);
  assert.deepEqual(names(sortItems(items, "name", "desc")), ["zèbre", "Émeraude", "Ambre"]);
});

test("sortItems orders numbers numerically and booleans true first when descending", () => {
  const items = [item({ name: "a", quantity: 10, foil: false }), item({ name: "b", quantity: 9, foil: true })];

  assert.deepEqual(names(sortItems(items, "quantity", "asc")), ["b", "a"]);
  assert.deepEqual(names(sortItems(items, "foil", "desc")), ["b", "a"]);
});

test("sortItems keeps missing values last whatever the direction", () => {
  const items = [item({ name: "none", game: null }), item({ name: "b", game: "B" }), item({ name: "a", game: "A" })];

  assert.deepEqual(names(sortItems(items, "game", "asc")), ["a", "b", "none"]);
  assert.deepEqual(names(sortItems(items, "game", "desc")), ["b", "a", "none"]);
});

test("sortItems does not mutate its input", () => {
  const items = [item({ name: "b" }), item({ name: "a" })];

  sortItems(items, "name", "asc");

  assert.deepEqual(names(items), ["b", "a"]);
});

const priced = (sell: number | null, buy: number | null = null): Prices => ({ sell, buy, currency: 3, fetchedAt: "2026-10-28T14:32:00.000Z" });

test("sortItems orders by sell or buy price, unpriced items last", () => {
  const items = [
    item({ name: "unpriced" }),
    item({ name: "cheap", quantity: 10, prices: priced(5, 9) }),
    item({ name: "dear", quantity: 1, prices: priced(40, 1) }),
    item({ name: "no sell order", prices: priced(null, 3) }),
  ];

  assert.deepEqual(names(sortItems(items, "sell", "desc")), ["dear", "cheap", "unpriced", "no sell order"]);
  assert.deepEqual(names(sortItems(items, "buy", "asc")), ["dear", "no sell order", "cheap", "unpriced"]);
});

test("computeTotals counts unique items and owned quantity", () => {
  const items = [item({ quantity: 1 }), item({ quantity: 3, prices: priced(10, 9) }), item({ quantity: 297, marketable: false })];

  assert.deepEqual(computeTotals(items), { rows: 3, quantity: 301 });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./app.ts";
import { openDatabase, saveInventory } from "./db.ts";
import { RateLimitError, type OrderBookPrices } from "./market.ts";
import type { Item } from "./inventory.ts";

const NOW = new Date("2026-10-28T14:32:00.000Z");

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
    iconUrl: "icon",
    ...overrides,
  };
}

function setup(fetchPrices: (marketHashName: string) => Promise<OrderBookPrices>) {
  const db = openDatabase(":memory:");
  saveInventory(
    db,
    [item({}), item({ marketHashName: "753-Gems", marketable: false }), item({ marketHashName: "1-A/B" })],
    "2026-10-28T10:00:00.000Z",
    "english",
  );
  const app = buildApp({ db, fetchPages: async () => [], fetchPrices, steamId: "76561198000000000", language: "english", now: () => NOW });
  return { app };
}

const pricesUrl = (marketHashName: string) => `/api/items/${encodeURIComponent(marketHashName)}/prices`;

test("POST prices fetches, stores and returns the item with its prices", async (t) => {
  const requested: string[] = [];
  const { app } = setup(async (name) => {
    requested.push(name);
    return { sell: 13, buy: 12 };
  });
  t.after(() => app.close());

  const res = await app.inject({ method: "POST", url: pricesUrl("281750-Sól") });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().prices, { sell: 13, buy: 12, fetchedAt: NOW.toISOString() });
  assert.deepEqual(requested, ["281750-Sól"]);
  const items = (await app.inject({ method: "GET", url: "/api/items" })).json().items;
  assert.equal(items[0].prices.sell, 13);
});

test("POST prices accepts market_hash_names containing a slash", async (t) => {
  const { app } = setup(async () => ({ sell: 5, buy: 4 }));
  t.after(() => app.close());

  const res = await app.inject({ method: "POST", url: pricesUrl("1-A/B") });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().marketHashName, "1-A/B");
});

test("POST prices refuses unknown and non-marketable items without calling Steam", async (t) => {
  let calls = 0;
  const { app } = setup(async () => {
    calls++;
    return { sell: 1, buy: 1 };
  });
  t.after(() => app.close());

  const unknown = await app.inject({ method: "POST", url: pricesUrl("nope") });
  const gems = await app.inject({ method: "POST", url: pricesUrl("753-Gems") });

  assert.equal(unknown.statusCode, 404);
  assert.equal(gems.statusCode, 400);
  assert.equal(calls, 0);
});

test("POST prices shares one Steam request between concurrent clicks on the same item", async (t) => {
  let calls = 0;
  const { app } = setup(async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { sell: 13, buy: 12 };
  });
  t.after(() => app.close());

  const [a, b] = await Promise.all([
    app.inject({ method: "POST", url: pricesUrl("281750-Sól") }),
    app.inject({ method: "POST", url: pricesUrl("281750-Sól") }),
  ]);

  assert.equal(a.statusCode, 200);
  assert.equal(b.statusCode, 200);
  assert.equal(calls, 1);
});

test("POST prices answers 503 when Steam keeps rate limiting", async (t) => {
  const { app } = setup(async () => {
    throw new RateLimitError();
  });
  t.after(() => app.close());

  const res = await app.inject({ method: "POST", url: pricesUrl("281750-Sól") });

  assert.equal(res.statusCode, 503);
  assert.match(res.json().error, /429/);
});

test("POST prices answers 502 and keeps the old prices when Steam fails", async (t) => {
  let fail = false;
  const { app } = setup(async () => {
    if (fail) throw new Error("Order book request failed: HTTP 500");
    return { sell: 13, buy: 12 };
  });
  t.after(() => app.close());
  await app.inject({ method: "POST", url: pricesUrl("281750-Sól") });
  fail = true;

  const res = await app.inject({ method: "POST", url: pricesUrl("281750-Sól") });

  assert.equal(res.statusCode, 502);
  assert.match(res.json().error, /HTTP 500/);
  const items = (await app.inject({ method: "GET", url: "/api/items" })).json().items;
  assert.equal(items[0].prices.sell, 13);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createBoard, type FetchFn } from "./board.ts";
import { createMemoryClient } from "../data/memory-client.ts";
import { savePrices, setSetting } from "../data/store.ts";
import { InventoryError, type InventoryPage } from "../core/inventory.ts";
import { RateLimitError } from "../core/market.ts";
import { MarketQueue } from "../core/queue.ts";
import type { SqlClient } from "../data/sql-client.ts";

const NOW = new Date("2026-10-28T14:32:00.000Z");
const STEAM_ID = "76561198078288325";

function description(hash: string, marketable = 1) {
  return {
    classid: hash,
    instanceid: "0",
    name: hash.split("-")[1],
    market_hash_name: hash,
    type: "Trading Card",
    icon_url: "icon",
    tradable: 1,
    marketable,
    tags: [{ category: "Game", internal_name: "app_281750", localized_tag_name: "Munin" }],
  };
}

function page(...hashes: string[]): InventoryPage {
  return {
    assets: hashes.map((hash, i) => ({ assetid: String(i), classid: hash, instanceid: "0", amount: "1" })),
    descriptions: hashes.map((hash) => description(hash, hash === "753-Gems" ? 0 : 1)),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const orderBook = (sell: number, buy: number) =>
  json({ data: { success: true, data: { eCurrency: 3, amtMinSellOrder: sell, amtMaxBuyOrder: buy } } });

/** Fake Steam: inventory pages and order books served from the given handlers, every URL recorded. */
function fakeSteam(handlers: { inventory?: () => Response; orderBook?: (hash: string) => Promise<Response> | Response }) {
  const urls: string[] = [];
  const fetchFn: FetchFn = async (url) => {
    urls.push(url);
    if (url.includes("/inventory/")) return (handlers.inventory ?? (() => json(page("281750-Sól"))))();
    const hash = JSON.parse(new URL(url).searchParams.get("qp")!)[1] as string;
    return (handlers.orderBook ?? (() => orderBook(13, 12)))(hash);
  };
  return { fetchFn, urls, orderBookCalls: () => urls.filter((u) => u.includes("/orderbook")).length };
}

async function setup(steam = fakeSteam({}), withSteamId = true) {
  const db: SqlClient = createMemoryClient();
  if (withSteamId) await setSetting(db, "steam_id", STEAM_ID);
  const queue = new MarketQueue({ intervalMs: 0, backoffMs: 0, maxRetries: 0, sleep: async () => {} });
  return { db, steam, board: createBoard({ db, fetchFn: steam.fetchFn, queue, now: () => NOW }) };
}

test("load returns the cached inventory and the SteamID without calling Steam", async () => {
  const { board, steam } = await setup();

  assert.deepEqual(await board.load(), { items: [], fetchedAt: null, steamId: STEAM_ID });
  assert.equal(steam.urls.length, 0);
});

test("refreshInventory fetches the inventory in English, caches and returns it", async () => {
  const { board, steam } = await setup();

  const inventory = await board.refreshInventory();

  assert.match(steam.urls[0], new RegExp(`/inventory/${STEAM_ID}/753/6\\?l=english`));
  assert.equal(inventory.fetchedAt, NOW.toISOString());
  assert.deepEqual(inventory.items.map((i) => i.marketHashName), ["281750-Sól"]);
  assert.deepEqual(await board.load(), inventory);
});

test("refreshInventory keeps the cache and rejects with the Steam failure", async () => {
  let status = 200;
  const { board } = await setup(fakeSteam({ inventory: () => (status === 200 ? json(page("281750-Sól")) : json(null, status)) }));
  const cached = await board.refreshInventory();
  status = 403;

  await assert.rejects(board.refreshInventory(), (e: unknown) => e instanceof InventoryError && e.reason === "private");
  assert.deepEqual(await board.load(), cached);
});

test("refreshInventory rejects when no SteamID is set", async () => {
  const { board, steam } = await setup(fakeSteam({}), false);

  await assert.rejects(board.refreshInventory(), /No SteamID/);
  assert.equal(steam.urls.length, 0);
});

test("fetchPrices fetches, stores and returns the item with its prices", async () => {
  const { board } = await setup();
  await board.refreshInventory();

  const item = await board.fetchPrices("281750-Sól");

  assert.deepEqual(item.prices, { sell: 13, buy: 12, currency: 3, fetchedAt: NOW.toISOString() });
  assert.equal((await board.load()).items[0].prices?.sell, 13);
});

test("fetchPrices refuses unknown and non-marketable items without calling Steam", async () => {
  const steam = fakeSteam({ inventory: () => json(page("281750-Sól", "753-Gems")) });
  const { board } = await setup(steam);
  await board.refreshInventory();

  await assert.rejects(board.fetchPrices("nope"), /Unknown item/);
  await assert.rejects(board.fetchPrices("753-Gems"), /cannot be sold/);
  assert.equal(steam.orderBookCalls(), 0);
});

test("fetchPrices shares one Steam request between concurrent clicks on the same item", async () => {
  const steam = fakeSteam({});
  const { board } = await setup(steam);
  await board.refreshInventory();

  const [a, b] = await Promise.all([board.fetchPrices("281750-Sól"), board.fetchPrices("281750-Sól")]);

  assert.equal(a.prices?.sell, 13);
  assert.equal(b.prices?.sell, 13);
  assert.equal(steam.orderBookCalls(), 1);
});

test("fetchPrices rejects with RateLimitError when Steam keeps rate limiting", async () => {
  const { board } = await setup(fakeSteam({ orderBook: () => json(null, 429) }));
  await board.refreshInventory();

  await assert.rejects(board.fetchPrices("281750-Sól"), RateLimitError);
});

test("fetchPrices keeps the old prices when Steam fails", async () => {
  const { board, db } = await setup(fakeSteam({ orderBook: () => json(null, 500) }));
  await board.refreshInventory();
  await savePrices(db, "281750-Sól", { sell: 13, buy: 12, currency: 3 }, "2026-10-27T10:00:00.000Z");

  await assert.rejects(board.fetchPrices("281750-Sól"), /HTTP 500/);
  assert.equal((await board.load()).items[0].prices?.sell, 13);
});

test("fetchPrices for an item removed by an inventory refresh rejects Unknown item", async () => {
  let inventory = page("281750-Sól");
  let releaseOrderBook = () => {};
  const steam = fakeSteam({
    inventory: () => json(inventory),
    orderBook: () => new Promise<Response>((resolve) => (releaseOrderBook = () => resolve(orderBook(13, 12)))),
  });
  const { board } = await setup(steam);
  await board.refreshInventory();

  const pending = board.fetchPrices("281750-Sól");
  await new Promise((resolve) => setTimeout(resolve, 0));
  inventory = page("281750-Hugin");
  await board.refreshInventory();
  releaseOrderBook();

  await assert.rejects(pending, /Unknown item/);
});

test("setSteamId stores the SteamID and makes the inventory stale until refreshed", async () => {
  const { board } = await setup(fakeSteam({}), false);
  assert.equal(await board.inventoryIsStale(), true);

  await board.setSteamId(STEAM_ID);
  assert.equal((await board.load()).steamId, STEAM_ID);
  await board.refreshInventory();

  assert.equal(await board.inventoryIsStale(), false);
});

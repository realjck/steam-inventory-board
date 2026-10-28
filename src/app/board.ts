/** What the page asks of the app: the cached inventory, inventory refreshes, on-demand prices, the SteamID. */
import { fetchInventory, groupItems } from "../core/inventory.ts";
import { fetchOrderBook } from "../core/market.ts";
import type { BoardItem } from "../core/items.ts";
import type { MarketQueue } from "../core/queue.ts";
import type { SqlClient } from "../data/sql-client.ts";
import * as store from "../data/store.ts";

export type FetchFn = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

/** Steam data language; the interface is in English. */
const LANGUAGE = "english";

export type Inventory = { items: BoardItem[]; fetchedAt: string | null; steamId: string | null };

export interface Board {
  load(): Promise<Inventory>;
  refreshInventory(): Promise<Inventory>;
  fetchPrices(marketHashName: string): Promise<BoardItem>;
  setSteamId(steamId: string): Promise<void>;
  inventoryIsStale(): Promise<boolean>;
}

export type BoardDeps = {
  db: SqlClient;
  fetchFn: FetchFn;
  /** Every market call goes through it: one at a time, spaced out, backing off on 429. */
  queue: MarketQueue;
  now?: () => Date;
};

export function createBoard({ db, fetchFn, queue, now = () => new Date() }: BoardDeps): Board {
  // Concurrent requests for the same item share one Steam call.
  const pending = new Map<string, Promise<BoardItem>>();
  // Inventory refreshes run one after another: two saves must never interleave their writes.
  let refreshes: Promise<unknown> = Promise.resolve();

  async function load(): Promise<Inventory> {
    return { ...(await store.loadInventory(db)), steamId: await store.getSetting(db, "steam_id") };
  }

  async function requireItem(marketHashName: string): Promise<BoardItem> {
    const item = await store.loadItem(db, marketHashName);
    if (!item) throw new Error("Unknown item");
    return item;
  }

  async function requestPrices(marketHashName: string): Promise<BoardItem> {
    const prices = await queue.run(() => fetchOrderBook(marketHashName, fetchFn));
    await store.savePrices(db, marketHashName, prices, now().toISOString());
    // The item may have left the inventory while the request waited in the queue.
    return requireItem(marketHashName);
  }

  /** Reads the SteamID when it starts, so a refresh queued after a SteamID change fetches the new account. */
  async function refreshNow(): Promise<Inventory> {
    const steamId = await store.getSetting(db, "steam_id");
    if (!steamId) throw new Error("No SteamID set");
    const items = groupItems(await fetchInventory(steamId, LANGUAGE, fetchFn));
    await store.saveInventory(db, items, now().toISOString(), steamId);
    return load();
  }

  return {
    load,

    refreshInventory() {
      const run = refreshes.then(refreshNow);
      refreshes = run.catch(() => undefined);
      return run;
    },

    async fetchPrices(marketHashName) {
      const item = await requireItem(marketHashName);
      if (!item.marketable) throw new Error("This item cannot be sold on the market");
      const existing = pending.get(marketHashName);
      if (existing) return existing;
      const request = requestPrices(marketHashName).finally(() => pending.delete(marketHashName));
      pending.set(marketHashName, request);
      return request;
    },

    async setSteamId(steamId) {
      await store.setSetting(db, "steam_id", steamId);
    },

    async inventoryIsStale() {
      const steamId = await store.getSetting(db, "steam_id");
      return steamId === null || store.inventoryIsStale(db, steamId);
    },
  };
}

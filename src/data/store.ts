/** SQLite cache: the last fetched inventory, the prices fetched on demand, and the settings. */
import type { Item } from "../core/inventory.ts";
import type { BoardItem, Prices } from "../core/items.ts";
import type { OrderBookPrices } from "../core/market.ts";
import type { SqlClient } from "./sql-client.ts";

/** 500 rows of 11 columns stay far below SQLite's limit on bound parameters. */
const INSERT_BATCH = 500;

const ITEM_COLUMNS = [
  "market_hash_name",
  "name",
  "game",
  "app_id",
  "type",
  "rarity",
  "foil",
  "quantity",
  "tradable",
  "marketable",
  "icon_url",
] as const;

type ItemRow = {
  market_hash_name: string;
  name: string;
  game: string | null;
  app_id: number | null;
  type: string | null;
  rarity: string | null;
  foil: number;
  quantity: number;
  tradable: number;
  marketable: number;
  icon_url: string;
};

type LoadedRow = ItemRow & {
  sell: number | null;
  buy: number | null;
  currency: number | null;
  prices_fetched_at: string | null;
};

function rowValues(item: Item): unknown[] {
  return [
    item.marketHashName,
    item.name,
    item.game,
    item.appId,
    item.type,
    item.rarity,
    Number(item.foil),
    item.quantity,
    Number(item.tradable),
    Number(item.marketable),
    item.iconUrl,
  ];
}

function pricesOf(row: LoadedRow): Prices | null {
  if (row.prices_fetched_at === null || row.currency === null) return null;
  return { sell: row.sell, buy: row.buy, currency: row.currency, fetchedAt: row.prices_fetched_at };
}

function toBoardItem(row: LoadedRow): BoardItem {
  return {
    marketHashName: row.market_hash_name,
    name: row.name,
    game: row.game,
    appId: row.app_id,
    type: row.type,
    rarity: row.rarity,
    foil: row.foil === 1,
    quantity: row.quantity,
    tradable: row.tradable === 1,
    marketable: row.marketable === 1,
    iconUrl: row.icon_url,
    prices: pricesOf(row),
  };
}

async function insertItems(db: SqlClient, items: Item[]): Promise<void> {
  for (let start = 0; start < items.length; start += INSERT_BATCH) {
    const batch = items.slice(start, start + INSERT_BATCH);
    const tuples = batch.map((_, row) => {
      const first = row * ITEM_COLUMNS.length;
      return `(${ITEM_COLUMNS.map((_, col) => `$${first + col + 1}`).join(", ")})`;
    });
    await db.execute(
      `INSERT INTO items (${ITEM_COLUMNS.join(", ")}) VALUES ${tuples.join(", ")}`,
      batch.flatMap(rowValues),
    );
  }
}

async function getMeta(db: SqlClient, key: string): Promise<string | null> {
  const rows = await db.select<{ value: string }>("SELECT value FROM meta WHERE key = $1", [key]);
  return rows[0]?.value ?? null;
}

async function setMeta(db: SqlClient, key: string, value: string): Promise<void> {
  await db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ($1, $2)", [key, value]);
}

/**
 * Replaces the cached inventory. The SQL plugin has no transaction spanning several calls, so the
 * fetch date is removed first and written last: an interrupted save leaves a cache seen as stale.
 */
export async function saveInventory(db: SqlClient, items: Item[], fetchedAt: string, steamId: string): Promise<void> {
  await db.execute("DELETE FROM meta WHERE key = 'inventory_fetched_at'");
  await db.execute("DELETE FROM items");
  await insertItems(db, items);
  await setMeta(db, "inventory_steam_id", steamId);
  await setMeta(db, "inventory_fetched_at", fetchedAt);
}

const SELECT_ITEMS = `
  SELECT items.*, prices.sell, prices.buy, prices.currency, prices.fetched_at AS prices_fetched_at
  FROM items LEFT JOIN prices USING (market_hash_name)`;

export async function loadInventory(db: SqlClient): Promise<{ items: BoardItem[]; fetchedAt: string | null }> {
  const rows = await db.select<LoadedRow>(`${SELECT_ITEMS} ORDER BY items.rowid`);
  return { items: rows.map(toBoardItem), fetchedAt: await getMeta(db, "inventory_fetched_at") };
}

export async function loadItem(db: SqlClient, marketHashName: string): Promise<BoardItem | null> {
  const rows = await db.select<LoadedRow>(`${SELECT_ITEMS} WHERE market_hash_name = $1`, [marketHashName]);
  return rows[0] ? toBoardItem(rows[0]) : null;
}

export async function savePrices(
  db: SqlClient,
  marketHashName: string,
  prices: OrderBookPrices,
  fetchedAt: string,
): Promise<void> {
  await db.execute(
    "INSERT OR REPLACE INTO prices (market_hash_name, sell, buy, currency, fetched_at) VALUES ($1, $2, $3, $4, $5)",
    [marketHashName, prices.sell, prices.buy, prices.currency, fetchedAt],
  );
}

export type SettingKey = "steam_id";

export async function getSetting(db: SqlClient, key: SettingKey): Promise<string | null> {
  return getMeta(db, `setting_${key}`);
}

export async function setSetting(db: SqlClient, key: SettingKey, value: string): Promise<void> {
  await setMeta(db, `setting_${key}`, value);
}

/** True when the inventory must be fetched: never fetched, interrupted, or fetched for another account. */
export async function inventoryIsStale(db: SqlClient, steamId: string): Promise<boolean> {
  const fetchedAt = await getMeta(db, "inventory_fetched_at");
  return fetchedAt === null || (await getMeta(db, "inventory_steam_id")) !== steamId;
}

/** SQLite cache: the last fetched inventory, and the prices fetched on demand (kept across refreshes). */
import Database from "better-sqlite3";
import type { Item } from "./inventory.ts";
import type { OrderBookPrices } from "./market.ts";

export type Db = Database.Database;

/** Prices in cents, with the time they were fetched. */
export type Prices = OrderBookPrices & { fetchedAt: string };

export type BoardItem = Item & { prices: Prices | null };

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS items (
    market_hash_name TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    game TEXT,
    app_id INTEGER,
    type TEXT,
    rarity TEXT,
    foil INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    tradable INTEGER NOT NULL,
    marketable INTEGER NOT NULL,
    icon_url TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS prices (
    market_hash_name TEXT PRIMARY KEY,
    sell INTEGER,
    buy INTEGER,
    fetched_at TEXT NOT NULL
  );
`;

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

type LoadedRow = ItemRow & { sell: number | null; buy: number | null; prices_fetched_at: string | null };

/** Caches created before appId existed get the column, and refetch the inventory to fill it. */
function migrate(db: Db): void {
  const columns = db.prepare("SELECT name FROM pragma_table_info('items')").all() as { name: string }[];
  if (columns.some((c) => c.name === "app_id")) return;
  db.exec("ALTER TABLE items ADD COLUMN app_id INTEGER; DELETE FROM meta WHERE key = 'inventory_fetched_at';");
}

export function openDatabase(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

function toRow(item: Item): ItemRow {
  return {
    market_hash_name: item.marketHashName,
    name: item.name,
    game: item.game,
    app_id: item.appId,
    type: item.type,
    rarity: item.rarity,
    foil: Number(item.foil),
    quantity: item.quantity,
    tradable: Number(item.tradable),
    marketable: Number(item.marketable),
    icon_url: item.iconUrl,
  };
}

function fromRow(row: ItemRow): Item {
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
  };
}

/** Replaces the cached inventory with a fresh one, atomically. */
export function saveInventory(db: Db, items: Item[], fetchedAt: string): void {
  const insert = db.prepare(`
    INSERT INTO items (market_hash_name, name, game, app_id, type, rarity, foil, quantity, tradable, marketable, icon_url)
    VALUES (@market_hash_name, @name, @game, @app_id, @type, @rarity, @foil, @quantity, @tradable, @marketable, @icon_url)
  `);
  db.transaction(() => {
    db.prepare("DELETE FROM items").run();
    for (const item of items) insert.run(toRow(item));
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('inventory_fetched_at', ?)").run(fetchedAt);
  })();
}

export function savePrices(db: Db, marketHashName: string, prices: OrderBookPrices, fetchedAt: string): void {
  db.prepare("INSERT OR REPLACE INTO prices (market_hash_name, sell, buy, fetched_at) VALUES (?, ?, ?, ?)").run(
    marketHashName,
    prices.sell,
    prices.buy,
    fetchedAt,
  );
}

function pricesOf(row: LoadedRow): Prices | null {
  return row.prices_fetched_at === null ? null : { sell: row.sell, buy: row.buy, fetchedAt: row.prices_fetched_at };
}

const SELECT_ITEMS = `
  SELECT items.*, prices.sell, prices.buy, prices.fetched_at AS prices_fetched_at
  FROM items LEFT JOIN prices USING (market_hash_name)`;

const toBoardItem = (row: LoadedRow): BoardItem => ({ ...fromRow(row), prices: pricesOf(row) });

export function loadItem(db: Db, marketHashName: string): BoardItem | null {
  const row = db.prepare(`${SELECT_ITEMS} WHERE market_hash_name = ?`).get(marketHashName) as LoadedRow | undefined;
  return row ? toBoardItem(row) : null;
}

export function loadInventory(db: Db): { items: BoardItem[]; fetchedAt: string | null } {
  const rows = db.prepare(`${SELECT_ITEMS} ORDER BY items.rowid`).all() as LoadedRow[];
  const meta = db.prepare("SELECT value FROM meta WHERE key = 'inventory_fetched_at'").get() as
    | { value: string }
    | undefined;
  return { items: rows.map(toBoardItem), fetchedAt: meta?.value ?? null };
}

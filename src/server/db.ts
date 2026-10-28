/** SQLite cache: the last fetched inventory (prices come in milestone 4). */
import Database from "better-sqlite3";
import type { Item } from "./inventory.ts";

export type Db = Database.Database;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS items (
    market_hash_name TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    game TEXT,
    type TEXT,
    rarity TEXT,
    foil INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    tradable INTEGER NOT NULL,
    marketable INTEGER NOT NULL,
    icon_url TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

type ItemRow = {
  market_hash_name: string;
  name: string;
  game: string | null;
  type: string | null;
  rarity: string | null;
  foil: number;
  quantity: number;
  tradable: number;
  marketable: number;
  icon_url: string;
};

export function openDatabase(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

function toRow(item: Item): ItemRow {
  return {
    market_hash_name: item.marketHashName,
    name: item.name,
    game: item.game,
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
    INSERT INTO items (market_hash_name, name, game, type, rarity, foil, quantity, tradable, marketable, icon_url)
    VALUES (@market_hash_name, @name, @game, @type, @rarity, @foil, @quantity, @tradable, @marketable, @icon_url)
  `);
  db.transaction(() => {
    db.prepare("DELETE FROM items").run();
    for (const item of items) insert.run(toRow(item));
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('inventory_fetched_at', ?)").run(fetchedAt);
  })();
}

export function loadInventory(db: Db): { items: Item[]; fetchedAt: string | null } {
  const rows = db.prepare("SELECT * FROM items ORDER BY rowid").all() as ItemRow[];
  const meta = db.prepare("SELECT value FROM meta WHERE key = 'inventory_fetched_at'").get() as
    | { value: string }
    | undefined;
  return { items: rows.map(fromRow), fetchedAt: meta?.value ?? null };
}

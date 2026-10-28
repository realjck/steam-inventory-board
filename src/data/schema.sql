-- Cache schema, applied as migration 1 by the Tauri SQL plugin and by the test client.
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
CREATE TABLE IF NOT EXISTS prices (
  market_hash_name TEXT PRIMARY KEY,
  sell INTEGER,
  buy INTEGER,
  currency INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

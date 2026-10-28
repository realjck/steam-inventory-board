/** The app's real dependencies: the SQLite file through the SQL plugin, Steam through the HTTP plugin. */
import Database from "@tauri-apps/plugin-sql";
import { fetch } from "@tauri-apps/plugin-http";
import type { SqlClient } from "../data/sql-client.ts";
import type { FetchFn } from "./board.ts";

/** Same name as the migration declared in src-tauri/src/lib.rs. */
const DATABASE = "sqlite:steam-inventory-board.db";

export async function openAppDatabase(): Promise<SqlClient> {
  const db = await Database.load(DATABASE);
  return {
    async execute(sql, params) {
      await db.execute(sql, params);
    },
    select<T>(sql: string, params?: unknown[]) {
      return db.select<T[]>(sql, params);
    },
  };
}

/**
 * Requests run in the Rust side of the app, so Steam's missing CORS headers do not matter. An empty
 * Origin tells the HTTP plugin to send none: the market order book answers 401 to the app's origin.
 */
export const steamFetch: FetchFn = (url, init) => fetch(url, { ...init, headers: { ...init?.headers, Origin: "" } });

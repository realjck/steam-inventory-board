/** In-memory SqlClient over better-sqlite3, for tests only. */
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import type { SqlClient } from "./sql-client.ts";

const SCHEMA = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

// better-sqlite3 reads $N as ?N, a numbered parameter that is bound by name: { 1: value, 2: value }.
const numbered = (sql: string) => sql.replace(/\$(\d+)/g, "?$1");
const bind = (params: unknown[]) =>
  params.length === 0 ? [] : [Object.fromEntries(params.map((value, i) => [i + 1, value]))];

export function createMemoryClient(): SqlClient {
  const db = new Database(":memory:");
  db.exec(SCHEMA);
  return {
    async execute(sql, params = []) {
      db.prepare(numbered(sql)).run(...bind(params));
    },
    async select<T>(sql: string, params: unknown[] = []) {
      return db.prepare(numbered(sql)).all(...bind(params)) as T[];
    },
  };
}

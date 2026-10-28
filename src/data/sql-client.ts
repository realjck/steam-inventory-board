/**
 * The two operations the store needs from SQLite. Parameters are written $1, $2…, the
 * placeholder style of the Tauri SQL plugin.
 */
export interface SqlClient {
  execute(sql: string, params?: unknown[]): Promise<void>;
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

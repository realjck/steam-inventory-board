/** User-facing messages for inventory refresh failures. */
import type { InventoryFailure } from "./inventory.ts";

const BY_REASON: Record<Exclude<InventoryFailure, "unavailable">, string> = {
  private:
    "Steam denies access to the inventory: it is private or cannot be found. Make it public in your Steam profile's privacy settings.",
  "rate-limited": "Steam is rate limiting inventory requests. Try again in a few minutes.",
};

export function describeInventoryError(reason: InventoryFailure, message: string, hasCache: boolean): string {
  const text = reason === "unavailable" ? `Refresh failed: ${message}.` : BY_REASON[reason];
  return hasCache ? `${text} The table shows the cached inventory.` : text;
}

/** Tauri plugins reject with plain strings, not Error objects. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

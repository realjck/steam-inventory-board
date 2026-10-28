/** Page-side state of the on-demand price requests (the market queue runs them in order). */
import { RateLimitError } from "./market.ts";

export type PriceState =
  | { status: "idle" }
  | { status: "queued" }
  | { status: "loading" }
  | { status: "error"; message: string };

export const IDLE: PriceState = { status: "idle" };

/** The queue serves requests first in, first out: the oldest pending one is the one running. */
export function priceStatuses(pending: string[]): Map<string, "loading" | "queued"> {
  return new Map(pending.map((hash, index) => [hash, index === 0 ? "loading" : "queued"]));
}

export function describePriceError(error: unknown): string {
  if (error instanceof RateLimitError) return "Steam is rate limiting requests, try again later";
  return `Failed: ${error instanceof Error ? error.message : String(error)}`;
}

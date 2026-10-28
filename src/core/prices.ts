/** Client-side state of the on-demand price requests (the server queue runs them in order). */

export type PriceState =
  | { status: "idle" }
  | { status: "queued" }
  | { status: "loading" }
  | { status: "error"; message: string };

export const IDLE: PriceState = { status: "idle" };

/** The server serves requests first in, first out: the oldest pending one is the one running. */
export function priceStatuses(pending: string[]): Map<string, "loading" | "queued"> {
  return new Map(pending.map((hash, index) => [hash, index === 0 ? "loading" : "queued"]));
}

export function describePriceError(status: number, message: string): string {
  return status === 503 ? "Steam is rate limiting requests, try again later" : `Failed: ${message}`;
}

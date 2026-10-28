/** An inventory item as the board shows it: the item plus the prices fetched for it, if any. */
import type { Item } from "./inventory.ts";
import type { OrderBookPrices } from "./market.ts";

/** Prices in cents, with the time they were fetched. */
export type Prices = OrderBookPrices & { fetchedAt: string };

export type BoardItem = Item & { prices: Prices | null };

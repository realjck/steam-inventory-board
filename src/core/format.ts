/** Display helpers shared by the table and the header. */
import { currencyCode } from "./currency.ts";

/** British English: English words with day-first dates and a 24-hour clock. */
const LOCALE = "en-GB";

export function marketUrl(marketHashName: string): string {
  return `https://steamcommunity.com/market/listings/753/${encodeURIComponent(marketHashName)}`;
}

/** Appid of Steam itself: gems and other non-game items, which have no badge page. */
const STEAM_APP_ID = 753;

/** The owner's badge page for the item's game, which lists the cards collected. */
export function collectionUrl(steamId: string, appId: number | null): string | null {
  if (appId === null || appId === STEAM_APP_ID) return null;
  return `https://steamcommunity.com/profiles/${steamId}/gamecards/${appId}`;
}

/** "28/10/2026 at 17:09"; the time zone defaults to the browser's. */
export function formatFetchedAt(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat(LOCALE, { dateStyle: "short", timeZone }).format(date);
  const time = new Intl.DateTimeFormat(LOCALE, { timeStyle: "short", timeZone }).format(date);
  return `${day} at ${time}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString(LOCALE);
}

/** Hundredths of the unit to "€0.13"; the currency is a Steam currency id. */
export function formatPrice(cents: number, currency: number): string {
  const code = currencyCode(currency);
  if (code === null) throw new Error(`Unsupported Steam currency ${currency}`);
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency: code }).format(cents / 100);
}

/** "28/10 14:32", for the per-row price date. */
export function formatShortDate(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "2-digit", timeZone }).format(date);
  const time = new Intl.DateTimeFormat(LOCALE, { timeStyle: "short", timeZone }).format(date);
  return `${day} ${time}`;
}

/** Footer summary: "2,608 unique items (Total 2,994)", or "61 of 2,608 unique items" when filters hide items. */
export function formatTotals(rows: number, quantity: number, allRows: number): string {
  const total = `(Total ${formatCount(quantity)})`;
  if (rows !== allRows) return `${formatCount(rows)} of ${formatCount(allRows)} unique items ${total}`;
  return `${formatCount(rows)} ${rows === 1 ? "unique item" : "unique items"} ${total}`;
}

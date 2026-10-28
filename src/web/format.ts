/** Display helpers shared by the table and the header. */

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

/** "28/10/2026 à 17:09"; the time zone defaults to the browser's. */
export function formatFetchedAt(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone }).format(date);
  return `${day} à ${time}`;
}

/** Barlow lacks the narrow no-break space fr-FR uses between thousands, so use a regular one. */
export function formatCount(n: number): string {
  return n.toLocaleString("fr-FR").replace(/\u202f/g, "\u00a0");
}

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** Cents to "0,13 €" (Steam prices are integers in cents). */
export function formatPrice(cents: number): string {
  return euros.format(cents / 100).replace(/\u202f/g, "\u00a0");
}

/** "28/10 14:32", for the per-row price date. */
export function formatShortDate(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone }).format(date);
  return `${day} ${time}`;
}

/** Footer summary: "2 608 objets uniques (Total 2 994)", with "sur N" when filters hide items. */
export function formatTotals(rows: number, quantity: number, allRows: number): string {
  const noun = rows === 1 ? "objet unique" : "objets uniques";
  const outOf = rows === allRows ? "" : ` sur ${formatCount(allRows)}`;
  return `${formatCount(rows)} ${noun}${outOf} (Total ${formatCount(quantity)})`;
}

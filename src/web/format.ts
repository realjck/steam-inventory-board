/** Display helpers shared by the table and the header. */

export function marketUrl(marketHashName: string): string {
  return `https://steamcommunity.com/market/listings/753/${encodeURIComponent(marketHashName)}`;
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

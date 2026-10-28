/** Pure table logic: filtering, sorting and footer totals. */
import type { BoardItem as Item } from "./items.ts";

export type Filters = {
  search: string;
  type: string | null;
  rarity: string | null;
  foilOnly: boolean;
  tradableOnly: boolean;
  marketableOnly: boolean;
  duplicatesOnly: boolean;
};

export const NO_FILTERS: Filters = {
  search: "",
  type: null,
  rarity: null,
  foilOnly: false,
  tradableOnly: false,
  marketableOnly: false,
  duplicatesOnly: false,
};

export type SortKey = "name" | "game" | "type" | "rarity" | "foil" | "quantity" | "sell" | "buy" | "tradable" | "marketable";
export type SortDirection = "asc" | "desc";

type SortValue = string | number | boolean | null;

const SORT_VALUES: Record<SortKey, (item: Item) => SortValue> = {
  name: (i) => i.name,
  game: (i) => i.game,
  type: (i) => i.type,
  rarity: (i) => i.rarity,
  foil: (i) => i.foil,
  quantity: (i) => i.quantity,
  sell: (i) => i.prices?.sell ?? null,
  buy: (i) => i.prices?.buy ?? null,
  tradable: (i) => i.tradable,
  marketable: (i) => i.marketable,
};

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Lowercases and strips accents so "sol" finds "Sól". */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function filterItems(items: Item[], filters: Filters): Item[] {
  const query = normalize(filters.search.trim());
  return items.filter(
    (i) =>
      (!query || normalize(i.name).includes(query) || normalize(i.game ?? "").includes(query)) &&
      (!filters.type || i.type === filters.type) &&
      (!filters.rarity || i.rarity === filters.rarity) &&
      (!filters.foilOnly || i.foil) &&
      (!filters.tradableOnly || i.tradable) &&
      (!filters.marketableOnly || i.marketable) &&
      (!filters.duplicatesOnly || i.quantity >= 2),
  );
}

function compareValues(a: Exclude<SortValue, null>, b: Exclude<SortValue, null>): number {
  if (typeof a === "string" && typeof b === "string") return collator.compare(a, b);
  return Number(a) - Number(b);
}

/** Returns a sorted copy; missing values always come last. */
export function sortItems(items: Item[], key: SortKey, direction: SortDirection): Item[] {
  const value = SORT_VALUES[key];
  const sign = direction === "asc" ? 1 : -1;
  return [...items].sort((x, y) => {
    const a = value(x);
    const b = value(y);
    if (a === null || b === null) return Number(a === null) - Number(b === null);
    return sign * compareValues(a, b);
  });
}

export function computeTotals(items: Item[]): { rows: number; quantity: number } {
  return { rows: items.length, quantity: items.reduce((sum, i) => sum + i.quantity, 0) };
}

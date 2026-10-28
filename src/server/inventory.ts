/** Steam community inventory (appid 753, context 6): response types and grouping. */

const ICON_BASE = "https://community.fastly.steamstatic.com/economy/image/";

export type Tag = { category: string; internal_name: string; localized_tag_name: string };

export type Description = {
  classid: string;
  instanceid: string;
  name: string;
  market_hash_name: string;
  type: string;
  icon_url: string;
  tradable: number;
  marketable: number;
  tags?: Tag[];
};

export type Asset = { assetid: string; classid: string; instanceid: string; amount: string };

export type InventoryPage = {
  assets?: Asset[];
  descriptions?: Description[];
  more_items?: number;
  last_assetid?: string;
};

export type Item = {
  marketHashName: string;
  name: string;
  game: string | null;
  /** Steam appid of the game, from the Game tag ("app_915230"). */
  appId: number | null;
  type: string | null;
  rarity: string | null;
  foil: boolean;
  quantity: number;
  tradable: boolean;
  marketable: boolean;
  iconUrl: string;
};

function tagLabel(description: Description, category: string): string | null {
  return description.tags?.find((t) => t.category === category)?.localized_tag_name ?? null;
}

function gameAppId(description: Description): number | null {
  const internalName = description.tags?.find((t) => t.category === "Game")?.internal_name;
  const match = internalName?.match(/^app_(\d+)$/);
  return match ? Number(match[1]) : null;
}

function toItem(description: Description): Item {
  return {
    marketHashName: description.market_hash_name,
    name: description.name,
    game: tagLabel(description, "Game"),
    appId: gameAppId(description),
    type: tagLabel(description, "item_class"),
    rarity: tagLabel(description, "droprate"),
    foil: description.tags?.some((t) => t.internal_name === "cardborder_1") ?? false,
    quantity: 0,
    tradable: description.tradable === 1,
    marketable: description.marketable === 1,
    iconUrl: ICON_BASE + description.icon_url,
  };
}

/** Merges assets from all pages into one item per market_hash_name (duplicates summed). */
export function groupItems(pages: InventoryPage[]): Item[] {
  const descriptions = new Map<string, Description>();
  for (const d of pages.flatMap((p) => p.descriptions ?? [])) {
    descriptions.set(`${d.classid}_${d.instanceid}`, d);
  }

  const items = new Map<string, Item>();
  for (const asset of pages.flatMap((p) => p.assets ?? [])) {
    const description = descriptions.get(`${asset.classid}_${asset.instanceid}`);
    if (!description) throw new Error(`No description for asset ${asset.assetid}`);
    const item = items.get(description.market_hash_name) ?? toItem(description);
    item.quantity += Number(asset.amount);
    items.set(item.marketHashName, item);
  }
  return [...items.values()];
}

const PAGE_SIZE = 2000;

type FetchFn = (url: string) => Promise<Response>;

function inventoryUrl(steamId: string, language: string, startAssetId?: string): string {
  const url = `https://steamcommunity.com/inventory/${steamId}/753/6?l=${language}&count=${PAGE_SIZE}`;
  return startAssetId ? `${url}&start_assetid=${startAssetId}` : url;
}

/** Downloads every inventory page; the inventory must be public. */
export async function fetchInventory(steamId: string, language: string, fetchFn: FetchFn = fetch): Promise<InventoryPage[]> {
  const pages: InventoryPage[] = [];
  let start: string | undefined;
  do {
    const res = await fetchFn(inventoryUrl(steamId, language, start));
    if (!res.ok) throw new Error(`Inventory request failed: HTTP ${res.status}`);
    const page = (await res.json()) as InventoryPage;
    pages.push(page);
    start = page.more_items ? page.last_assetid : undefined;
  } while (start);
  return pages;
}

/**
 * Milestone 1 recon: calls each Steam endpoint once, saves raw responses to
 * samples/ and prints what was learned about each [À VÉRIFIER] point of SPEC.md.
 * Usage: npm run recon (requires .env, see .env.example).
 */
import { mkdir, writeFile } from "node:fs/promises";

const STEAM_ID64 = requireEnv("STEAM_ID64");
const CURRENCY = process.env.CURRENCY ?? "3";
const LANGUAGE = process.env.LANGUAGE ?? "french";

const SAMPLES_DIR = "samples";
const DELAY_MS = 3000;
const COMMUNITY = "https://steamcommunity.com";

type Tag = { category: string; internal_name: string; localized_tag_name: string };
type Description = {
  classid: string;
  instanceid: string;
  market_hash_name?: string;
  marketable: number;
  tradable: number;
  tags?: Tag[];
};
type InventoryPage = {
  assets?: { assetid: string; classid: string; instanceid: string; amount: string }[];
  descriptions?: Description[];
  more_items?: number;
  last_assetid?: string;
  total_inventory_count?: number;
};

const findings: Record<string, unknown> = {};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.includes("X")) throw new Error(`Missing or placeholder ${name} in .env`);
  return value;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function save(name: string, body: string): Promise<void> {
  await writeFile(`${SAMPLES_DIR}/${name}`, body, "utf8");
}

/** Fetches a URL after the polite delay and saves the raw body. */
async function fetchAndSave(name: string, url: string): Promise<{ status: number; body: string }> {
  await sleep(DELAY_MS);
  const res = await fetch(url);
  const body = await res.text();
  await save(name, body);
  console.log(`${res.status} ${name} <- ${url}`);
  return { status: res.status, body };
}

function inventoryUrl(count: number, startAssetId?: string): string {
  const url = new URL(`${COMMUNITY}/inventory/${STEAM_ID64}/753/6`);
  url.searchParams.set("l", LANGUAGE);
  url.searchParams.set("count", String(count));
  if (startAssetId) url.searchParams.set("start_assetid", startAssetId);
  return url.toString();
}

async function probeMaxCount(): Promise<void> {
  const probes: Record<number, number> = {};
  for (const count of [2500, 5000]) {
    probes[count] = (await fetchAndSave(`inventory-count-${count}.json`, inventoryUrl(count))).status;
  }
  findings.inventoryCountProbes = probes;
}

async function fetchFullInventory(): Promise<{ assets: number; descriptions: Description[] }> {
  const descriptions: Description[] = [];
  let assets = 0;
  let start: string | undefined;
  let page = 0;
  do {
    const { status, body } = await fetchAndSave(`inventory-page-${page}.json`, inventoryUrl(2000, start));
    if (status !== 200) throw new Error(`Inventory request failed with HTTP ${status}`);
    const data = JSON.parse(body) as InventoryPage;
    assets += data.assets?.length ?? 0;
    descriptions.push(...(data.descriptions ?? []));
    findings.totalInventoryCount = data.total_inventory_count;
    start = data.more_items ? data.last_assetid : undefined;
    page++;
  } while (start);
  findings.inventoryPages = page;
  findings.assetCount = assets;
  findings.descriptionCount = descriptions.length;
  return { assets, descriptions };
}

/** Lists every distinct value of the tag categories used by the filters. */
function summarizeTags(descriptions: Description[]): Record<string, Record<string, string>> {
  const wanted = ["Game", "item_class", "droprate", "cardborder"];
  const summary: Record<string, Record<string, string>> = {};
  for (const tag of descriptions.flatMap((d) => d.tags ?? [])) {
    if (!wanted.includes(tag.category)) continue;
    summary[tag.category] ??= {};
    summary[tag.category][tag.internal_name] = tag.localized_tag_name;
  }
  return summary;
}

function countDuplicates(descriptions: Description[]): void {
  const withoutHashName = descriptions.filter((d) => !d.market_hash_name).length;
  const hashNames = new Set(descriptions.map((d) => d.market_hash_name));
  findings.descriptionsWithoutMarketHashName = withoutHashName;
  findings.distinctMarketHashNames = hashNames.size;
}

async function probePriceOverview(hashName: string): Promise<void> {
  const url = `${COMMUNITY}/market/priceoverview/?appid=753&currency=${CURRENCY}&market_hash_name=${encodeURIComponent(hashName)}`;
  findings.priceOverviewStatus = (await fetchAndSave("priceoverview.json", url)).status;
}

async function probeSearchRender(gameTag: string): Promise<void> {
  const url = `${COMMUNITY}/market/search/render/?norender=1&appid=753&count=100&start=0&currency=${CURRENCY}&category_753_Game[]=tag_${gameTag}`;
  const { status, body } = await fetchAndSave("search-render.json", url);
  findings.searchRenderStatus = status;
  if (status !== 200) return;
  const data = JSON.parse(body) as {
    total_count?: number;
    pagesize?: number;
    results?: { sell_price_text?: string }[];
  };
  findings.searchRenderTotalCount = data.total_count;
  findings.searchRenderPageSize = data.pagesize;
  findings.searchRenderPriceText = data.results?.[0]?.sell_price_text;
}

/**
 * The 2025 market redesign dropped Market_LoadOrderSpread/item_nameid from listing
 * pages; the React front end reads the order book from this query action instead.
 */
async function probeOrderBook(hashName: string): Promise<void> {
  await sleep(DELAY_MS);
  const url = new URL(`${COMMUNITY}/market/orderbook`);
  url.searchParams.set("q", "Load");
  url.searchParams.set("qp", JSON.stringify([753, hashName]));
  const res = await fetch(url, { headers: { "x-valve-request-type": "queryAction" } });
  const body = await res.text();
  await save("orderbook.json", body);
  console.log(`${res.status} orderbook.json <- ${url}`);
  findings.orderBookStatus = res.status;
  if (res.status !== 200) return;
  const book = (JSON.parse(body) as { data?: { data?: Record<string, unknown> } }).data?.data;
  findings.orderBookMaxBuyOrder = book?.amtMaxBuyOrder;
  findings.orderBookMinSellOrder = book?.amtMinSellOrder;
  findings.orderBookCurrency = book?.eCurrency;
}

async function main(): Promise<void> {
  await mkdir(SAMPLES_DIR, { recursive: true });

  const { descriptions } = await fetchFullInventory();
  await probeMaxCount();
  const tags = summarizeTags(descriptions);
  await save("tags-summary.json", JSON.stringify(tags, null, 2));
  countDuplicates(descriptions);

  const sample = descriptions.find((d) => d.marketable && d.market_hash_name);
  if (!sample?.market_hash_name) throw new Error("No marketable item found in inventory");
  findings.sampleItem = sample.market_hash_name;

  await probePriceOverview(sample.market_hash_name);
  const gameTag = sample.tags?.find((t) => t.category === "Game")?.internal_name;
  if (gameTag) await probeSearchRender(gameTag);
  await probeOrderBook(sample.market_hash_name);

  await save("findings.json", JSON.stringify(findings, null, 2));
  console.log("\nFindings:", JSON.stringify(findings, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

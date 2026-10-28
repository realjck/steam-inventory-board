/** Page wiring: loads the cached inventory, keeps the table in sync with filters and sort, fetches prices on click. */
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow-semi-condensed/500.css";
import "@fontsource/barlow-semi-condensed/600.css";
import "./style.css";
import type { BoardItem as Item } from "../core/items.ts";
import { computeTotals, filterItems, sortItems, NO_FILTERS, type Filters, type SortDirection, type SortKey } from "../core/table.ts";
import { createRow } from "./rows.ts";
import { formatFetchedAt, formatTotals } from "../core/format.ts";
import { REFRESH_ICON, SETTINGS_ICON } from "./icons.ts";
import { setupSettings } from "./settings.ts";
import { describePriceError, priceStatuses, IDLE, type PriceState } from "../core/prices.ts";
import { describeInventoryError, errorMessage } from "../core/messages.ts";
import { inventoryTitle, type Profile } from "../core/profile.ts";
import { InventoryError } from "../core/inventory.ts";
import { MarketQueue } from "../core/queue.ts";
import { createBoard, type Board, type Inventory } from "../app/board.ts";
import { openAppDatabase, openInBrowser, steamFetch } from "../app/tauri.ts";

/** Market pacing: one request at a time, 3 s apart, backing off 30 s, 60 s, 120 s on HTTP 429. */
const MARKET_QUEUE = { intervalMs: 3000, backoffMs: 30_000, maxRetries: 3 };

let board: Board;


const state = {
  items: [] as Item[],
  steamId: "",
  rows: new Map<string, HTMLTableRowElement>(),
  /** Price requests sent and not answered yet, oldest first. */
  pendingPrices: [] as string[],
  priceErrors: new Map<string, string>(),
  filters: { ...NO_FILTERS } as Filters,
  sort: { key: "game" as SortKey, direction: "asc" as SortDirection },
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  form: $<HTMLFormElement>("filters"),
  search: $<HTMLInputElement>("search"),
  type: $<HTMLSelectElement>("type"),
  rarity: $<HTMLSelectElement>("rarity"),
  foilOnly: $<HTMLInputElement>("foil-only"),
  duplicatesOnly: $<HTMLInputElement>("duplicates-only"),
  tradableOnly: $<HTMLInputElement>("tradable-only"),
  marketableOnly: $<HTMLInputElement>("marketable-only"),
  rows: $<HTMLTableSectionElement>("rows"),
  empty: $<HTMLDivElement>("empty"),
  fetchedAt: $<HTMLParagraphElement>("fetched-at"),
  refresh: $<HTMLButtonElement>("refresh-inventory"),
  syncError: $<HTMLParagraphElement>("sync-error"),
  totals: $<HTMLTableCellElement>("totals"),
};


function readFilters(): Filters {
  return {
    search: els.search.value,
    type: els.type.value || null,
    rarity: els.rarity.value || null,
    foilOnly: els.foilOnly.checked,
    duplicatesOnly: els.duplicatesOnly.checked,
    tradableOnly: els.tradableOnly.checked,
    marketableOnly: els.marketableOnly.checked,
  };
}

function fillSelect(select: HTMLSelectElement, values: (string | null)[]): void {
  const distinct = [...new Set(values.filter((v): v is string => v !== null))];
  distinct.sort(new Intl.Collator("en").compare);
  select.length = 1;
  for (const value of distinct) select.add(new Option(value, value));
}

function renderEmpty(visible: Item[]): void {
  els.empty.hidden = visible.length > 0;
  if (visible.length > 0) return;
  els.empty.textContent =
    state.items.length === 0
      ? "No inventory cached yet. The refresh button at the top right loads it from Steam."
      : "No items match these filters.";
}

function render(): void {
  const visible = sortItems(filterItems(state.items, state.filters), state.sort.key, state.sort.direction);
  // Re-inserting the rows detaches them, which drops focus from any control inside. Blur first:
  // removing a focused element makes the browser lay out the emptied body and reset its scroll to the top.
  const focused = els.rows.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
  focused?.blur();
  els.rows.replaceChildren(...visible.map((item) => state.rows.get(item.marketHashName)!));
  if (focused?.isConnected) focused.focus({ preventScroll: true });
  renderEmpty(visible);

  const totals = computeTotals(visible);
  els.totals.textContent = formatTotals(totals.rows, totals.quantity, state.items.length);
}

function priceStateOf(hash: string): PriceState {
  const pending = priceStatuses(state.pendingPrices).get(hash);
  if (pending) return { status: pending };
  const error = state.priceErrors.get(hash);
  return error ? { status: "error", message: error } : IDLE;
}

function updateRows(hashes: string[]): void {
  for (const hash of hashes) {
    const item = state.items.find((i) => i.marketHashName === hash);
    if (!item) continue;
    const row = createRow(item, priceStateOf(hash), state.steamId);
    const old = state.rows.get(hash);
    const hadFocus = old?.contains(document.activeElement) ?? false;
    old?.replaceWith(row);
    state.rows.set(hash, row);
    if (hadFocus) focusPriceControl(row);
  }
}

/** Keeps keyboard focus on the price control while its row is rebuilt between request states. */
function focusPriceControl(row: HTMLTableRowElement): void {
  const target = row.querySelector<HTMLElement>("button[data-action=prices]") ?? row.querySelector<HTMLElement>(".col-prices");
  target?.focus({ preventScroll: true });
}

async function requestPrices(hash: string): Promise<void> {
  if (state.pendingPrices.includes(hash)) return;
  state.pendingPrices.push(hash);
  state.priceErrors.delete(hash);
  updateRows([hash]);
  try {
    const updated = await board.fetchPrices(hash);
    state.items = state.items.map((i) => (i.marketHashName === hash ? updated : i));
  } catch (error) {
    state.priceErrors.set(hash, describePriceError(error));
  }
  state.pendingPrices = state.pendingPrices.filter((h) => h !== hash);
  updateRows([hash, ...state.pendingPrices]);
  render();
}

function renderSortHeaders(): void {
  for (const th of document.querySelectorAll<HTMLTableCellElement>("th[data-sort]")) {
    const active = th.dataset.sort === state.sort.key;
    th.ariaSort = active ? (state.sort.direction === "asc" ? "ascending" : "descending") : null;
  }
}

function setInventory(inventory: Inventory): void {
  state.items = inventory.items;
  state.steamId = inventory.steamId ?? "";
  state.rows = new Map(inventory.items.map((item) => [item.marketHashName, createRow(item, priceStateOf(item.marketHashName), state.steamId)]));
  fillSelect(els.type, inventory.items.map((i) => i.type));
  fillSelect(els.rarity, inventory.items.map((i) => i.rarity));
  els.fetchedAt.textContent = inventory.fetchedAt ? `Inventory from ${formatFetchedAt(inventory.fetchedAt)}` : "";
  renderOwner(inventory.profile);
  state.filters = readFilters();
  render();
}

/** "Real's inventory (realjck)": persona name, then the custom URL name in small type. */
function renderOwner(profile: Profile | null): void {
  const title = inventoryTitle(profile);
  $<HTMLSpanElement>("owner-name").textContent = title;
  const url = $<HTMLElement>("owner-url");
  url.hidden = !profile?.customUrl;
  url.textContent = profile?.customUrl ? `(${profile.customUrl})` : "";
  document.title = `${title} - Steam Inventory Board`;
}

function showSyncError(message: string | null): void {
  els.syncError.hidden = message === null;
  els.syncError.textContent = message ?? "";
}

async function refreshInventory(): Promise<void> {
  els.refresh.disabled = true;
  els.refresh.setAttribute("aria-busy", "true");
  showSyncError(null);
  const hasCache = state.items.length > 0;
  try {
    setInventory(await board.refreshInventory());
  } catch (error) {
    const reason = error instanceof InventoryError ? error.reason : "unavailable";
    showSyncError(describeInventoryError(reason, errorMessage(error), hasCache));
  } finally {
    els.refresh.disabled = false;
    els.refresh.removeAttribute("aria-busy");
  }
}

/**
 * Uses a new SteamID once its inventory loads. If it cannot (private inventory, typo), the previous
 * SteamID is restored so the table and the stored account stay in step.
 */
async function changeSteamId(steamId: string): Promise<string | null> {
  const previous = state.steamId || null;
  if (steamId === previous && !(await board.inventoryIsStale())) return null;
  await board.setSteamId(steamId);
  try {
    setInventory(await board.refreshInventory());
    showSyncError(null);
    return null;
  } catch (error) {
    if (previous) await board.setSteamId(previous);
    const reason = error instanceof InventoryError ? error.reason : "unavailable";
    return describeInventoryError(reason, errorMessage(error), false);
  }
}

function setupSortHeaders(): void {
  for (const th of document.querySelectorAll<HTMLTableCellElement>("th[data-sort]")) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = th.textContent;
    th.replaceChildren(button);
    button.addEventListener("click", () => {
      const key = th.dataset.sort as SortKey;
      const sameKey = state.sort.key === key;
      state.sort = { key, direction: sameKey && state.sort.direction === "asc" ? "desc" : "asc" };
      renderSortHeaders();
      render();
    });
  }
  renderSortHeaders();
}

function setupFilters(): void {
  let searchTimer: number | undefined;
  els.form.addEventListener("input", (event) => {
    window.clearTimeout(searchTimer);
    const delay = event.target === els.search ? 120 : 0;
    searchTimer = window.setTimeout(() => {
      state.filters = readFilters();
      render();
    }, delay);
  });
  els.form.addEventListener("submit", (event) => event.preventDefault());
  els.form.addEventListener("reset", () => {
    state.filters = { ...NO_FILTERS };
    render();
  });
}

function setupPriceButtons(): void {
  els.rows.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button[data-action=prices]");
    const hash = button?.closest("tr")?.dataset.hash;
    if (hash) requestPrices(hash);
  });
}

/** Steam links open in the default browser; left alone, the app window would navigate away. */
function setupSteamLinks(): void {
  els.rows.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="https://steamcommunity.com/"]');
    if (!link) return;
    event.preventDefault();
    openInBrowser(link.href);
  });
}

/** Only the table body scrolls; the header follows it sideways, the totals stay put. */
function syncHorizontalScroll(): void {
  const header = els.rows.parentElement!.querySelector("thead")!;
  els.rows.addEventListener(
    "scroll",
    () => {
      header.scrollLeft = els.rows.scrollLeft;
    },
    { passive: true },
  );
}

async function start(): Promise<void> {
  els.refresh.innerHTML = REFRESH_ICON;
  els.refresh.addEventListener("click", refreshInventory);
  const settings = setupSettings(changeSteamId);
  const openSettings = $<HTMLButtonElement>("open-settings");
  openSettings.innerHTML = SETTINGS_ICON;
  openSettings.addEventListener("click", () => settings.show(state.steamId || null));
  setupSortHeaders();
  setupFilters();
  syncHorizontalScroll();
  setupPriceButtons();
  setupSteamLinks();
  try {
    board = createBoard({ db: await openAppDatabase(), fetchFn: steamFetch, queue: new MarketQueue(MARKET_QUEUE) });
    const inventory = await board.load();
    setInventory(inventory);
    if (!inventory.steamId) settings.show(null);
    else if (await board.inventoryIsStale()) await refreshInventory();
  } catch (error) {
    showSyncError(`The local database could not be opened: ${errorMessage(error)}`);
  }
}

start();

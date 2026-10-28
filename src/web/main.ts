/** Page wiring: loads the cached inventory and keeps the table in sync with filters and sort. */
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow-semi-condensed/500.css";
import "@fontsource/barlow-semi-condensed/600.css";
import "./style.css";
import type { Item } from "../server/inventory.ts";
import { computeTotals, filterItems, sortItems, NO_FILTERS, type Filters, type SortDirection, type SortKey } from "./table.ts";
import { createRow } from "./rows.ts";
import { formatCount, formatFetchedAt } from "./format.ts";
import { REFRESH_ICON } from "./icons.ts";

type Inventory = { items: Item[]; fetchedAt: string | null };

const state = {
  items: [] as Item[],
  rows: new Map<string, HTMLTableRowElement>(),
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
  totalRows: $<HTMLTableCellElement>("total-rows"),
  totalQuantity: $<HTMLTableCellElement>("total-quantity"),
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
  distinct.sort(new Intl.Collator("fr").compare);
  select.length = 1;
  for (const value of distinct) select.add(new Option(value, value));
}

function renderEmpty(visible: Item[]): void {
  els.empty.hidden = visible.length > 0;
  if (visible.length > 0) return;
  els.empty.textContent =
    state.items.length === 0
      ? "Aucun inventaire en cache. Le bouton de rafraîchissement, en haut à droite, le charge depuis Steam."
      : "Aucun objet ne correspond à ces filtres.";
}

function render(): void {
  const visible = sortItems(filterItems(state.items, state.filters), state.sort.key, state.sort.direction);
  els.rows.replaceChildren(...visible.map((item) => state.rows.get(item.marketHashName)!));
  renderEmpty(visible);

  const totals = computeTotals(visible);
  els.totalRows.textContent =
    visible.length === state.items.length
      ? `${formatCount(totals.rows)} objets`
      : `${formatCount(totals.rows)} objets affichés sur ${formatCount(state.items.length)}`;
  els.totalQuantity.textContent = formatCount(totals.quantity);
}

function renderSortHeaders(): void {
  for (const th of document.querySelectorAll<HTMLTableCellElement>("th[data-sort]")) {
    const active = th.dataset.sort === state.sort.key;
    th.ariaSort = active ? (state.sort.direction === "asc" ? "ascending" : "descending") : null;
  }
}

function setInventory(inventory: Inventory): void {
  state.items = inventory.items;
  state.rows = new Map(inventory.items.map((item) => [item.marketHashName, createRow(item)]));
  fillSelect(els.type, inventory.items.map((i) => i.type));
  fillSelect(els.rarity, inventory.items.map((i) => i.rarity));
  els.fetchedAt.textContent = inventory.fetchedAt ? `Inventaire du ${formatFetchedAt(inventory.fetchedAt)}` : "";
  state.filters = readFilters();
  render();
}

function showSyncError(message: string | null): void {
  els.syncError.hidden = message === null;
  els.syncError.textContent = message ?? "";
}

async function refreshInventory(): Promise<void> {
  els.refresh.disabled = true;
  els.refresh.setAttribute("aria-busy", "true");
  showSyncError(null);
  try {
    const res = await fetch("/api/refresh/inventory", { method: "POST" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    setInventory(body as Inventory);
  } catch (error) {
    showSyncError(`Le rafraîchissement a échoué : ${(error as Error).message}. L'inventaire affiché est celui du cache.`);
  } finally {
    els.refresh.disabled = false;
    els.refresh.removeAttribute("aria-busy");
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

/** Only the table body scrolls; the header and the totals follow it sideways. */
function syncHorizontalScroll(): void {
  const header = els.rows.parentElement!.querySelector("thead")!;
  const footer = els.rows.parentElement!.querySelector("tfoot")!;
  els.rows.addEventListener(
    "scroll",
    () => {
      header.scrollLeft = els.rows.scrollLeft;
      footer.scrollLeft = els.rows.scrollLeft;
    },
    { passive: true },
  );
}

async function start(): Promise<void> {
  els.refresh.innerHTML = REFRESH_ICON;
  els.refresh.addEventListener("click", refreshInventory);
  setupSortHeaders();
  setupFilters();
  syncHorizontalScroll();
  try {
    const res = await fetch("/api/items");
    setInventory((await res.json()) as Inventory);
  } catch {
    showSyncError("Le serveur local ne répond pas. Relancez-le avec npm start.");
  }
}

start();

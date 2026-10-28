/** Price cells of a row: sell, buy, and the fetch/refresh control with its state. */
import type { BoardItem } from "../core/items.ts";
import { DOWNLOAD_ICON, REFRESH_ICON } from "./icons.ts";
import { formatFetchedAt, formatPrice, formatShortDate } from "../core/format.ts";
import type { PriceState } from "../core/prices.ts";

function cell(className: string): HTMLTableCellElement {
  const td = document.createElement("td");
  td.className = className;
  return td;
}

/** Empty until prices are fetched; "—" once fetched when that side of the order book is empty. */
function amountCell(cents: number | null | undefined, fetched: boolean): HTMLTableCellElement {
  const td = cell("num");
  if (cents != null) td.textContent = formatPrice(cents);
  else if (fetched) {
    td.textContent = "—";
    td.classList.add("missing");
  }
  return td;
}

function priceButton(icon: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button small";
  button.dataset.action = "prices";
  button.title = label;
  button.ariaLabel = label;
  button.innerHTML = icon;
  return button;
}

/** Icon followed by its visible label, for the first fetch of a row. */
function labelledPriceButton(icon: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "labelled-button";
  button.dataset.action = "prices";
  button.innerHTML = icon;
  button.append(label);
  return button;
}

function statusText(text: string, className: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function controlCell(item: BoardItem, state: PriceState): HTMLTableCellElement {
  const td = cell("col-prices");
  // Focusable by script only, so focus has somewhere to stay while no button is shown.
  td.tabIndex = -1;
  if (state.status === "loading") {
    const spinner = statusText("", "spinner");
    spinner.innerHTML = REFRESH_ICON;
    td.append(spinner, statusText("Loading", "price-status"));
  } else if (state.status === "queued") {
    td.append(statusText("Queued", "price-status"));
  } else if (state.status === "error") {
    td.append(statusText(state.message, "price-error"), priceButton(REFRESH_ICON, "Retry"));
  } else if (item.prices) {
    const date = document.createElement("time");
    date.dateTime = item.prices.fetchedAt;
    date.title = `Prices from ${formatFetchedAt(item.prices.fetchedAt)}`;
    date.textContent = formatShortDate(item.prices.fetchedAt);
    td.append(date, priceButton(REFRESH_ICON, "Refresh prices"));
  } else {
    td.append(labelledPriceButton(DOWNLOAD_ICON, "Get prices"));
  }
  return td;
}

export function priceCells(item: BoardItem, state: PriceState): HTMLTableCellElement[] {
  if (!item.marketable) {
    return [amountCell(null, true), amountCell(null, true), cell("col-prices")];
  }
  const fetched = item.prices !== null;
  return [
    amountCell(item.prices?.sell, fetched),
    amountCell(item.prices?.buy, fetched),
    controlCell(item, state),
  ];
}

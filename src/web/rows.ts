/** Builds one table row per item; Steam strings are only ever set as text. */
import type { Item } from "../server/inventory.ts";
import { CHECK_ICON } from "./icons.ts";
import { formatCount, marketUrl } from "./format.ts";

const ICON_SIZE = "/64fx64f";

function cell(className?: string): HTMLTableCellElement {
  const td = document.createElement("td");
  if (className) td.className = className;
  return td;
}

function textCell(text: string | null, className?: string): HTMLTableCellElement {
  const td = cell(className);
  td.textContent = text ?? "—";
  if (text === null) td.classList.add("missing");
  return td;
}

function iconCell(item: Item): HTMLTableCellElement {
  const td = cell("col-icon");
  const img = document.createElement("img");
  img.src = item.iconUrl + ICON_SIZE;
  img.alt = "";
  img.width = 40;
  img.height = 40;
  img.loading = "lazy";
  td.append(img);
  return td;
}

function nameCell(item: Item): HTMLTableCellElement {
  const td = cell("col-name");
  if (!item.marketable) {
    td.textContent = item.name;
    return td;
  }
  const link = document.createElement("a");
  link.href = marketUrl(item.marketHashName);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = item.name;
  link.title = "Voir sur le marché Steam";
  td.append(link);
  return td;
}

function rarityCell(rarity: string | null): HTMLTableCellElement {
  if (rarity === null) return textCell(null);
  const td = cell();
  const label = document.createElement("span");
  label.className = "rarity";
  label.dataset.rarity = rarity;
  label.textContent = rarity;
  td.append(label);
  return td;
}

function foilCell(foil: boolean): HTMLTableCellElement {
  const td = cell();
  if (foil) {
    const chip = document.createElement("span");
    chip.className = "foil";
    chip.textContent = "Brillante";
    td.append(chip);
  }
  return td;
}

function flagCell(value: boolean): HTMLTableCellElement {
  const td = cell(value ? "flag yes" : "flag no");
  td.innerHTML = value ? CHECK_ICON : "–";
  const hidden = document.createElement("span");
  hidden.className = "visually-hidden";
  hidden.textContent = value ? "oui" : "non";
  td.append(hidden);
  return td;
}

function numberCell(value: number): HTMLTableCellElement {
  return textCell(formatCount(value), "num");
}

export function createRow(item: Item): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.append(
    iconCell(item),
    nameCell(item),
    textCell(item.game, "col-game"),
    textCell(item.type),
    rarityCell(item.rarity),
    foilCell(item.foil),
    numberCell(item.quantity),
    flagCell(item.tradable),
    flagCell(item.marketable),
  );
  return tr;
}

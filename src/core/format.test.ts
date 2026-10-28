import { test } from "node:test";
import assert from "node:assert/strict";
import { marketUrl, formatFetchedAt, formatCount, formatPrice, formatShortDate, formatTotals, collectionUrl } from "./format.ts";

test("marketUrl encodes the market_hash_name into the listing URL", () => {
  assert.equal(
    marketUrl("287860-The Tank (Foil)"),
    "https://steamcommunity.com/market/listings/753/287860-The%20Tank%20(Foil)",
  );
  assert.equal(marketUrl("281750-Sól"), "https://steamcommunity.com/market/listings/753/281750-S%C3%B3l");
  assert.equal(marketUrl("1-A/B?#"), "https://steamcommunity.com/market/listings/753/1-A%2FB%3F%23");
});

test("formatFetchedAt renders a day-first date and a 24-hour time in the given time zone", () => {
  assert.equal(formatFetchedAt("2026-10-28T16:09:05.223Z", "Europe/Paris"), "28/10/2026 at 17:09");
});

test("formatCount groups thousands with commas", () => {
  assert.equal(formatCount(2608), "2,608");
  assert.equal(formatCount(42), "42");
});

test("formatPrice renders cents in the Steam currency", () => {
  assert.equal(formatPrice(13, 3), "€0.13");
  assert.equal(formatPrice(123456, 3), "€1,234.56");
  assert.equal(formatPrice(13, 1), "US$0.13");
});

test("formatShortDate renders day, month and time", () => {
  assert.equal(formatShortDate("2026-10-28T13:32:00.000Z", "Europe/Paris"), "28/10 14:32");
});

test("formatTotals shows unique items and total quantity", () => {
  assert.equal(formatTotals(2608, 2994, 2608), "2,608 unique items (Total 2,994)");
});

test("formatTotals mentions the full count when filters hide items", () => {
  assert.equal(formatTotals(61, 447, 2608), "61 of 2,608 unique items (Total 447)");
});

test("formatTotals uses the singular for a single item", () => {
  assert.equal(formatTotals(1, 3, 1), "1 unique item (Total 3)");
});

test("collectionUrl points to the owner's badge page for the item's game", () => {
  assert.equal(
    collectionUrl("76561198078288325", 915230),
    "https://steamcommunity.com/profiles/76561198078288325/gamecards/915230",
  );
});

test("collectionUrl has no link for items without a game or tied to Steam itself", () => {
  assert.equal(collectionUrl("76561198078288325", null), null);
  assert.equal(collectionUrl("76561198078288325", 753), null);
});

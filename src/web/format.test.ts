import { test } from "node:test";
import assert from "node:assert/strict";
import { marketUrl, formatFetchedAt, formatCount } from "./format.ts";

test("marketUrl encodes the market_hash_name into the listing URL", () => {
  assert.equal(
    marketUrl("287860-The Tank (Foil)"),
    "https://steamcommunity.com/market/listings/753/287860-The%20Tank%20(Foil)",
  );
  assert.equal(marketUrl("281750-Sól"), "https://steamcommunity.com/market/listings/753/281750-S%C3%B3l");
  assert.equal(marketUrl("1-A/B?#"), "https://steamcommunity.com/market/listings/753/1-A%2FB%3F%23");
});

test("formatFetchedAt renders a French date and time in the given time zone", () => {
  assert.equal(formatFetchedAt("2026-10-28T16:09:05.223Z", "Europe/Paris"), "28/10/2026 à 17:09");
});

test("formatCount groups thousands with a regular no-break space", () => {
  assert.equal(formatCount(2608), "2\u00a0608");
  assert.equal(formatCount(42), "42");
});

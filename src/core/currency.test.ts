import { test } from "node:test";
import assert from "node:assert/strict";
import { currencyCode } from "./currency.ts";

test("currencyCode maps Steam currency ids to ISO 4217 codes", () => {
  assert.equal(currencyCode(3), "EUR");
  assert.equal(currencyCode(1), "USD");
});

test("currencyCode returns null for an unknown Steam currency id", () => {
  assert.equal(currencyCode(999), null);
});

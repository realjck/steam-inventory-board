import { test } from "node:test";
import assert from "node:assert/strict";
import { describePriceError, priceStatuses } from "./prices.ts";

test("describePriceError explains a Steam rate limit", () => {
  assert.equal(describePriceError(503, "Steam market rate limit reached (HTTP 429)"), "Steam limite les requêtes, réessayez plus tard");
});

test("describePriceError passes other server messages through", () => {
  assert.equal(describePriceError(502, "Order book request failed: HTTP 500"), "Échec : Order book request failed: HTTP 500");
});

test("priceStatuses marks the first pending request as loading and the others as queued", () => {
  assert.deepEqual(
    [...priceStatuses(["a", "b", "c"])],
    [
      ["a", "loading"],
      ["b", "queued"],
      ["c", "queued"],
    ],
  );
});

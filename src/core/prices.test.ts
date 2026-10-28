import { test } from "node:test";
import assert from "node:assert/strict";
import { describePriceError, priceStatuses } from "./prices.ts";
import { RateLimitError } from "./market.ts";

test("describePriceError explains a Steam rate limit", () => {
  assert.equal(describePriceError(new RateLimitError()), "Steam is rate limiting requests, try again later");
});

test("describePriceError passes other failures through", () => {
  assert.equal(describePriceError(new Error("Order book request failed: HTTP 500")), "Failed: Order book request failed: HTTP 500");
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

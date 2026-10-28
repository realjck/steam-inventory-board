import { test } from "node:test";
import assert from "node:assert/strict";
import { describeInventoryError } from "./messages.ts";

test("describeInventoryError tells how to make a private inventory visible", () => {
  assert.equal(
    describeInventoryError("private", "Inventory request failed: HTTP 403", false),
    "Steam denies access to the inventory: it is private or cannot be found. Make it public in your Steam profile's privacy settings.",
  );
});

test("describeInventoryError asks to wait when Steam rate limits", () => {
  assert.equal(
    describeInventoryError("rate-limited", "Inventory request failed: HTTP 429", false),
    "Steam is rate limiting inventory requests. Try again in a few minutes.",
  );
});

test("describeInventoryError passes other failures through", () => {
  assert.equal(describeInventoryError("unavailable", "fetch failed", false), "Refresh failed: fetch failed.");
});

test("describeInventoryError says the table still shows the cache", () => {
  assert.match(describeInventoryError("unavailable", "fetch failed", true), / The table shows the cached inventory\.$/);
});

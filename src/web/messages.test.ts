import { test } from "node:test";
import assert from "node:assert/strict";
import { describeInventoryError } from "./messages.ts";

test("describeInventoryError tells how to make a private inventory visible", () => {
  assert.equal(
    describeInventoryError("private", "Inventory request failed: HTTP 403", false),
    "Steam refuse l'accès à l'inventaire : il est privé ou introuvable. Rendez-le public dans les paramètres de confidentialité du profil Steam.",
  );
});

test("describeInventoryError asks to wait when Steam rate limits", () => {
  assert.equal(
    describeInventoryError("rate-limited", "Inventory request failed: HTTP 429", false),
    "Steam limite les requêtes d'inventaire. Réessayez dans quelques minutes.",
  );
});

test("describeInventoryError passes other failures through", () => {
  assert.equal(describeInventoryError("unavailable", "fetch failed", false), "Le rafraîchissement a échoué : fetch failed.");
});

test("describeInventoryError says the table still shows the cache", () => {
  assert.match(describeInventoryError("unavailable", "fetch failed", true), / L'inventaire affiché est celui du cache\.$/);
});

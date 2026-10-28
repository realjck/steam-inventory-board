import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The Tauri SQL plugin checksums each migration and refuses to start when an applied one changed:
// schema.sql is embedded as migration 1, so its bytes, line endings included, must never vary.
test("schema.sql uses LF line endings so the migration checksum stays stable", () => {
  const schema = readFileSync(new URL("./schema.sql", import.meta.url));

  assert.equal(schema.includes(0x0d), false);
});

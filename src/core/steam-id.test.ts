import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSteamId } from "./steam-id.ts";

test("parseSteamId accepts a 17-digit SteamID64", () => {
  assert.deepEqual(parseSteamId("76561198078288325"), { steamId: "76561198078288325" });
});

test("parseSteamId ignores surrounding spaces", () => {
  assert.deepEqual(parseSteamId("  76561198078288325 "), { steamId: "76561198078288325" });
});

test("parseSteamId explains that a profile URL is not a SteamID64", () => {
  assert.deepEqual(parseSteamId("https://steamcommunity.com/id/realjck"), {
    error: "Enter the 17-digit SteamID64, not a profile URL.",
  });
});

test("parseSteamId refuses anything but 17 digits", () => {
  assert.deepEqual(parseSteamId("12345"), { error: "A SteamID64 has exactly 17 digits." });
});

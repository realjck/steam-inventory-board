import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchInventory, groupItems, type InventoryPage, type Description } from "./inventory.ts";

function description(overrides: Partial<Description>): Description {
  return {
    classid: "1",
    instanceid: "0",
    name: "Sól",
    market_hash_name: "281750-Sól",
    type: "Munin Trading Card",
    icon_url: "icon-hash",
    tradable: 1,
    marketable: 1,
    tags: [
      { category: "Game", internal_name: "app_281750", localized_tag_name: "Munin" },
      { category: "item_class", internal_name: "item_class_2", localized_tag_name: "Carte à échanger" },
      { category: "droprate", internal_name: "droprate_0", localized_tag_name: "commun" },
      { category: "cardborder", internal_name: "cardborder_0", localized_tag_name: "Normale" },
    ],
    ...overrides,
  };
}

function asset(assetid: string, classid: string, instanceid: string, amount = "1") {
  return { assetid, classid, instanceid, amount };
}

test("groupItems maps a single asset to an item with its tags", () => {
  const page: InventoryPage = { assets: [asset("10", "1", "0")], descriptions: [description({})] };

  assert.deepEqual(groupItems([page]), [
    {
      marketHashName: "281750-Sól",
      name: "Sól",
      game: "Munin",
      appId: 281750,
      type: "Carte à échanger",
      rarity: "commun",
      foil: false,
      quantity: 1,
      tradable: true,
      marketable: true,
      iconUrl: "https://community.fastly.steamstatic.com/economy/image/icon-hash",
    },
  ]);
});

test("groupItems sums amounts across assets and pages sharing a market_hash_name", () => {
  const pages: InventoryPage[] = [
    { assets: [asset("10", "1", "0"), asset("11", "1", "0", "3")], descriptions: [description({})] },
    { assets: [asset("12", "1", "7")], descriptions: [description({ instanceid: "7" })] },
  ];

  const items = groupItems(pages);

  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 5);
});

test("groupItems flags foil cards from cardborder_1", () => {
  const foil = description({
    tags: [{ category: "cardborder", internal_name: "cardborder_1", localized_tag_name: "Premium" }],
  });

  const [item] = groupItems([{ assets: [asset("10", "1", "0")], descriptions: [foil] }]);

  assert.equal(item.foil, true);
});

test("groupItems leaves missing tags as null", () => {
  const untagged = description({ tags: [] });

  const [item] = groupItems([{ assets: [asset("10", "1", "0")], descriptions: [untagged] }]);

  assert.equal(item.game, null);
  assert.equal(item.appId, null);
  assert.equal(item.type, null);
  assert.equal(item.rarity, null);
  assert.equal(item.foil, false);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

test("fetchInventory follows pagination with start_assetid", async () => {
  const urls: string[] = [];
  const responses = [
    { assets: [asset("10", "1", "0")], descriptions: [description({})], more_items: 1, last_assetid: "10" },
    { assets: [asset("11", "1", "0")], descriptions: [description({})] },
  ];
  const fakeFetch = async (url: string | URL | Request) => {
    urls.push(String(url));
    return jsonResponse(responses[urls.length - 1]);
  };

  const pages = await fetchInventory("765", "french", fakeFetch);

  assert.equal(pages.length, 2);
  assert.equal(urls[0], "https://steamcommunity.com/inventory/765/753/6?l=french&count=2000");
  assert.equal(urls[1], "https://steamcommunity.com/inventory/765/753/6?l=french&count=2000&start_assetid=10");
});

test("fetchInventory rejects with the HTTP status when Steam refuses", async () => {
  const fakeFetch = async () => jsonResponse(null, 403);

  await assert.rejects(fetchInventory("765", "french", fakeFetch), /HTTP 403/);
});

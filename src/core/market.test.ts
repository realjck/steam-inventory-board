import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchOrderBook, RateLimitError } from "./market.ts";

const EUR = 3;

function book(data: Record<string, unknown>): string {
  return JSON.stringify({ data: { success: true, data: { eCurrency: EUR, ...data } } });
}

function fakeFetch(body: string, status = 200) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fn = async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} });
    return new Response(body, { status });
  };
  return { fn, calls };
}

test("fetchOrderBook calls the market order book query action", async () => {
  const { fn, calls } = fakeFetch(book({ amtMinSellOrder: 13, amtMaxBuyOrder: 12 }));

  await fetchOrderBook("281750-Sól", fn);

  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, "https://steamcommunity.com/market/orderbook");
  assert.equal(url.searchParams.get("q"), "Load");
  assert.equal(url.searchParams.get("qp"), '[753,"281750-Sól"]');
  assert.equal(calls[0].headers["x-valve-request-type"], "queryAction");
});

test("fetchOrderBook returns the lowest sell and highest buy prices in cents", async () => {
  const { fn } = fakeFetch(book({ amtMinSellOrder: 13, amtMaxBuyOrder: 12 }));

  assert.deepEqual(await fetchOrderBook("x", fn), { sell: 13, buy: 12, currency: EUR });
});

test("fetchOrderBook reports a missing side of the book as null", async () => {
  const { fn } = fakeFetch(book({ amtMinSellOrder: 0 }));

  assert.deepEqual(await fetchOrderBook("x", fn), { sell: null, buy: null, currency: EUR });
});

test("fetchOrderBook returns the currency Steam used", async () => {
  const { fn } = fakeFetch(book({ eCurrency: 1, amtMinSellOrder: 4 }));

  assert.equal((await fetchOrderBook("x", fn)).currency, 1);
});

test("fetchOrderBook rejects a currency it cannot display", async () => {
  const { fn } = fakeFetch(book({ eCurrency: 999, amtMinSellOrder: 4 }));

  await assert.rejects(fetchOrderBook("x", fn), /unsupported currency 999/);
});

test("fetchOrderBook raises RateLimitError on HTTP 429", async () => {
  const { fn } = fakeFetch("", 429);

  await assert.rejects(fetchOrderBook("x", fn), RateLimitError);
});

test("fetchOrderBook rejects other HTTP errors and unsuccessful answers", async () => {
  await assert.rejects(fetchOrderBook("x", fakeFetch("", 500).fn), /HTTP 500/);
  await assert.rejects(
    fetchOrderBook("x", fakeFetch(JSON.stringify({ data: { success: false } })).fn),
    /no order book/,
  );
});

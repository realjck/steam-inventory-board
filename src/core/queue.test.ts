import { test } from "node:test";
import assert from "node:assert/strict";
import { MarketQueue } from "./queue.ts";
import { RateLimitError } from "./market.ts";

/** Fake clock: sleeping advances time instantly and records each wait. */
function fakeClock() {
  let now = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
  };
}

function queue(clock = fakeClock()) {
  return new MarketQueue({ intervalMs: 3000, backoffMs: 30_000, maxRetries: 3, now: clock.now, sleep: clock.sleep });
}

test("MarketQueue runs one task at a time, in order", async () => {
  const q = queue();
  const events: string[] = [];
  const task = (name: string) => async () => {
    events.push(`start ${name}`);
    await Promise.resolve();
    events.push(`end ${name}`);
    return name;
  };

  const results = await Promise.all([q.run(task("a")), q.run(task("b"))]);

  assert.deepEqual(results, ["a", "b"]);
  assert.deepEqual(events, ["start a", "end a", "start b", "end b"]);
});

test("MarketQueue waits the interval between two requests", async () => {
  const clock = fakeClock();
  const q = queue(clock);

  await Promise.all([q.run(async () => 1), q.run(async () => 2)]);

  assert.deepEqual(clock.sleeps, [3000]);
});

test("MarketQueue does not wait when the interval has already passed", async () => {
  const clock = fakeClock();
  const q = queue(clock);
  await q.run(async () => 1);
  await clock.sleep(5000);
  clock.sleeps.length = 0;

  await q.run(async () => 2);

  assert.deepEqual(clock.sleeps, []);
});

test("MarketQueue retries rate-limited tasks with exponential backoff", async () => {
  const clock = fakeClock();
  const q = queue(clock);
  let attempts = 0;

  const result = await q.run(async () => {
    attempts++;
    if (attempts < 3) throw new RateLimitError();
    return "ok";
  });

  assert.equal(result, "ok");
  assert.deepEqual(clock.sleeps, [30_000, 60_000]);
});

test("MarketQueue gives up after maxRetries rate limits", async () => {
  const q = queue();
  let attempts = 0;

  await assert.rejects(
    q.run(async () => {
      attempts++;
      throw new RateLimitError();
    }),
    RateLimitError,
  );
  assert.equal(attempts, 4);
});

test("MarketQueue does not retry other errors and keeps serving later tasks", async () => {
  const q = queue();
  let attempts = 0;

  const failed = q.run(async () => {
    attempts++;
    throw new Error("HTTP 500");
  });
  const next = q.run(async () => "next");

  await assert.rejects(failed, /HTTP 500/);
  assert.equal(await next, "next");
  assert.equal(attempts, 1);
});

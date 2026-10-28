/** Serial queue for Steam market calls: one request at a time, spaced out, backing off on 429. */
import { RateLimitError } from "./market.ts";

export type QueueOptions = {
  /** Minimum delay between the starts of two requests. */
  intervalMs: number;
  /** First wait after a 429; doubled on each new 429 for the same task. */
  backoffMs: number;
  maxRetries: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class MarketQueue {
  private readonly options: Required<QueueOptions>;
  private tail: Promise<unknown> = Promise.resolve();
  private lastStart: number | null = null;

  constructor(options: QueueOptions) {
    this.options = { now: Date.now, sleep: realSleep, ...options };
  }

  /** Runs the task after every task queued before it has settled. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(() => this.execute(task));
    this.tail = result.catch(() => undefined);
    return result;
  }

  private async execute<T>(task: () => Promise<T>): Promise<T> {
    const { backoffMs, maxRetries, sleep } = this.options;
    for (let retry = 0; ; retry++) {
      await this.waitForInterval();
      try {
        return await task();
      } catch (error) {
        if (!(error instanceof RateLimitError) || retry === maxRetries) throw error;
        await sleep(backoffMs * 2 ** retry);
      }
    }
  }

  private async waitForInterval(): Promise<void> {
    const { intervalMs, now, sleep } = this.options;
    if (this.lastStart !== null) {
      const remaining = this.lastStart + intervalMs - now();
      if (remaining > 0) await sleep(remaining);
    }
    this.lastStart = now();
  }
}

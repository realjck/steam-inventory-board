/** Local REST API over the SQLite cache. */
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { saveInventory, loadInventory, loadItem, savePrices, type BoardItem, type Db } from "./db.ts";
import { groupItems, type InventoryPage } from "./inventory.ts";
import { RateLimitError, type OrderBookPrices } from "./market.ts";

export type AppDeps = {
  db: Db;
  fetchPages: () => Promise<InventoryPage[]>;
  /** Must go through the market queue: it is called once per click, never in bulk. */
  fetchPrices: (marketHashName: string) => Promise<OrderBookPrices>;
  /** Sent to the page so it can link each item to the owner's badge page. */
  steamId: string;
  now?: () => Date;
  /** Absolute path of the built front end; omitted, only the API is served. */
  webRoot?: string;
};

export function buildApp({ db, fetchPages, fetchPrices, steamId, now = () => new Date(), webRoot }: AppDeps): FastifyInstance {
  const app = Fastify();
  if (webRoot) app.register(fastifyStatic, { root: webRoot });

  // Concurrent requests for the same item share one Steam call.
  const pending = new Map<string, Promise<BoardItem>>();

  function refreshPrices(marketHashName: string): Promise<BoardItem> {
    const existing = pending.get(marketHashName);
    if (existing) return existing;
    const request = fetchPrices(marketHashName)
      .then((prices) => {
        savePrices(db, marketHashName, prices, now().toISOString());
        return loadItem(db, marketHashName)!;
      })
      .finally(() => pending.delete(marketHashName));
    pending.set(marketHashName, request);
    return request;
  }

  const inventory = () => ({ ...loadInventory(db), steamId });

  app.get("/api/items", async () => inventory());

  app.post("/api/refresh/inventory", async (_request, reply) => {
    try {
      const items = groupItems(await fetchPages());
      saveInventory(db, items, now().toISOString());
      return inventory();
    } catch (error) {
      return reply.code(502).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>("/api/items/:id/prices", async (request, reply) => {
    const item = loadItem(db, request.params.id);
    if (!item) return reply.code(404).send({ error: "Unknown item" });
    if (!item.marketable) return reply.code(400).send({ error: "This item cannot be sold on the market" });
    try {
      return await refreshPrices(item.marketHashName);
    } catch (error) {
      const status = error instanceof RateLimitError ? 503 : 502;
      return reply.code(status).send({ error: (error as Error).message });
    }
  });

  return app;
}

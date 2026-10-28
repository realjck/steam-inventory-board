/** Local REST API over the SQLite cache. */
import Fastify, { type FastifyInstance } from "fastify";
import { saveInventory, loadInventory, type Db } from "./db.ts";
import { groupItems, type InventoryPage } from "./inventory.ts";

export type AppDeps = {
  db: Db;
  fetchPages: () => Promise<InventoryPage[]>;
  now?: () => Date;
};

export function buildApp({ db, fetchPages, now = () => new Date() }: AppDeps): FastifyInstance {
  const app = Fastify();

  app.get("/api/items", async () => loadInventory(db));

  app.post("/api/refresh/inventory", async (_request, reply) => {
    try {
      const items = groupItems(await fetchPages());
      saveInventory(db, items, now().toISOString());
      return loadInventory(db);
    } catch (error) {
      return reply.code(502).send({ error: (error as Error).message });
    }
  });

  return app;
}

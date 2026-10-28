/** Local REST API over the SQLite cache. */
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { saveInventory, loadInventory, type Db } from "./db.ts";
import { groupItems, type InventoryPage } from "./inventory.ts";

export type AppDeps = {
  db: Db;
  fetchPages: () => Promise<InventoryPage[]>;
  now?: () => Date;
  /** Absolute path of the built front end; omitted, only the API is served. */
  webRoot?: string;
};

export function buildApp({ db, fetchPages, now = () => new Date(), webRoot }: AppDeps): FastifyInstance {
  const app = Fastify();
  if (webRoot) app.register(fastifyStatic, { root: webRoot });

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

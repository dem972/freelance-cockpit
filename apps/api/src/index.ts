import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createDb, ping } from "./db.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const app = createApp({ pingDb: () => ping(db) });

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on :${String(info.port)}`);
});

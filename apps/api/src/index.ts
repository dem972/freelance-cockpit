import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createDb, ping, runMigrations } from "./db.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
await runMigrations(db, env.MIGRATIONS_DIR);
const app = createApp({ db, pingDb: () => ping(db) });

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on :${String(info.port)}`);
});

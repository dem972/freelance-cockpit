import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { cloudflareAccess } from "./auth.js";
import { createDb, ping, runMigrations } from "./db.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
await runMigrations(db, env.MIGRATIONS_DIR);
const auth =
  env.AUTH_MODE === "access"
    ? cloudflareAccess({
        teamDomain: env.CF_ACCESS_TEAM_DOMAIN ?? "",
        audience: env.CF_ACCESS_AUD ?? "",
        allowedEmails: (env.ALLOWED_EMAILS ?? "").split(","),
      })
    : undefined;
if (auth === undefined)
  console.warn("AUTH_MODE=none: API is NOT protected (local development only)");
const app = createApp({ db, pingDb: () => ping(db), ...(auth === undefined ? {} : { auth }) });

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on :${String(info.port)}`);
});

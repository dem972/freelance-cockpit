import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema.js";
import type { Db } from "../src/db.js";

/** Fresh in-memory Postgres with the real SQL migrations applied. */
export async function testDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(import.meta.dirname, "../../../db/migrations"),
  });
  return db;
}

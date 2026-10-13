import path from "node:path";
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./db/schema.js";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(url: string) {
  return drizzle(postgres(url, { max: 5 }), { schema });
}

export async function runMigrations(db: ReturnType<typeof createDb>, folder: string) {
  await migrate(db, { migrationsFolder: path.resolve(folder) });
}

export async function ping(db: Db): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

export type Db = ReturnType<typeof createDb>;

export function createDb(url: string) {
  return drizzle(postgres(url, { max: 5 }));
}

export async function ping(db: Db): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

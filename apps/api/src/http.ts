import { HTTPException } from "hono/http-exception";
import type { z } from "zod";

/** Validates a payload; a failure becomes a 400 with the zod issues. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HTTPException(400, {
      res: Response.json({ error: "validation", issues: result.error.issues }, { status: 400 }),
    });
  }
  return result.data;
}

export function notFound(): never {
  throw new HTTPException(404, { message: "Not found" });
}

export function idParam(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return id;
}

export function yearParam(raw: string | undefined, fallback: number): number {
  const year = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new HTTPException(400, { message: "Invalid year" });
  }
  return year;
}

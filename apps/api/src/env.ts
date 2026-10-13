import { z } from "zod";

const Env = z
  .object({
    PORT: z.coerce.number().int().default(3000),
    DATABASE_URL: z.url(),
    MIGRATIONS_DIR: z.string().default("../../db/migrations"),
    /** "access": Cloudflare Access JWT required. "none": local development only. */
    AUTH_MODE: z.enum(["access", "none"]),
    CF_ACCESS_TEAM_DOMAIN: z.string().optional(),
    CF_ACCESS_AUD: z.string().optional(),
    /** Comma-separated. */
    ALLOWED_EMAILS: z.string().optional(),
    /** Shared secret for the internal agent service (≥ 32 chars), optional. */
    AGENT_API_TOKEN: z.string().min(32).optional(),
  })
  .refine(
    (e) =>
      e.AUTH_MODE === "none" ||
      [e.CF_ACCESS_TEAM_DOMAIN, e.CF_ACCESS_AUD, e.ALLOWED_EMAILS].every(
        (v) => (v ?? "").trim() !== "",
      ),
    { message: "AUTH_MODE=access needs CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD and ALLOWED_EMAILS" },
  );
export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return Env.parse(source);
}

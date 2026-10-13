import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface AccessConfig {
  /** e.g. "myteam.cloudflareaccess.com" */
  teamDomain: string;
  /** Application Audience (AUD) tag of the Access application. */
  audience: string;
  /** Emails allowed in, checked on top of the Access policy (defence in depth). */
  allowedEmails: string[];
  /** Key resolver; defaults to the team's public certs (tests inject their own). */
  getKey?: JWTVerifyGetKey;
}

const HEADER = "Cf-Access-Jwt-Assertion";

/**
 * Verifies the Cloudflare Access JWT on every request: signature against the
 * team's public keys, issuer, audience, expiry, then the email allowlist.
 * The header alone is never trusted.
 */
export function cloudflareAccess(config: AccessConfig): MiddlewareHandler {
  const issuer = `https://${config.teamDomain}`;
  const getKey = config.getKey ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  const allowed = new Set(config.allowedEmails.map((e) => e.trim().toLowerCase()));

  return async (c, next) => {
    const token = c.req.header(HEADER);
    if (token === undefined || token === "") return c.json({ error: "unauthenticated" }, 401);
    try {
      const { payload } = await jwtVerify(token, getKey, {
        issuer,
        audience: config.audience,
        algorithms: ["RS256"],
      });
      const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
      if (!allowed.has(email)) return c.json({ error: "forbidden" }, 403);
    } catch {
      return c.json({ error: "unauthenticated" }, 401);
    }
    await next();
  };
}

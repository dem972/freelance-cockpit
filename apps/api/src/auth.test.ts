import { beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { createApp } from "./app.js";
import { cloudflareAccess, serviceTokenOr } from "./auth.js";

const TEAM = "myteam.cloudflareaccess.com";
const AUD = "aud-tag-123";
let goodKey: CryptoKey;
let otherKey: CryptoKey;
let app: ReturnType<typeof createApp>;

async function token(claims: Record<string, unknown>, key = goodKey, kid = "k1") {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(`https://${TEAM}`)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

beforeAll(async () => {
  const good = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  goodKey = good.privateKey;
  otherKey = other.privateKey;
  const jwk = { ...(await exportJWK(good.publicKey)), kid: "k1", alg: "RS256" };
  app = createApp({
    pingDb: () => Promise.resolve(true),
    auth: cloudflareAccess({
      teamDomain: TEAM,
      audience: AUD,
      allowedEmails: ["me@example.com"],
      getKey: createLocalJWKSet({ keys: [jwk] }),
    }),
  });
  // A protected route to hit (no DB in this test app).
  app.get("/whoami", (c) => c.json({ ok: true }));
});

const get = (path: string, jwt?: string) =>
  app.request(path, jwt === undefined ? {} : { headers: { "Cf-Access-Jwt-Assertion": jwt } });

describe("Cloudflare Access JWT", () => {
  it("lets /api/health through without a token", async () => {
    expect((await get("/api/health")).status).toBe(200);
  });

  it("rejects a missing token", async () => {
    expect((await get("/api/whoami")).status).toBe(401);
  });

  it("accepts a valid token for an allowed email (case-insensitive)", async () => {
    expect((await get("/api/whoami", await token({ email: "Me@Example.com" }))).status).toBe(200);
  });

  it("rejects an allowed email signed by another key", async () => {
    const forged = await token({ email: "me@example.com" }, otherKey);
    expect((await get("/api/whoami", forged)).status).toBe(401);
  });

  it("rejects a valid token for another email", async () => {
    expect((await get("/api/whoami", await token({ email: "x@example.com" }))).status).toBe(403);
  });

  it("rejects a wrong audience or an expired token", async () => {
    const wrongAud = await new SignJWT({ email: "me@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(`https://${TEAM}`)
      .setAudience("other-app")
      .setExpirationTime("5m")
      .sign(goodKey);
    expect((await get("/api/whoami", wrongAud)).status).toBe(401);
    const expired = await new SignJWT({ email: "me@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(`https://${TEAM}`)
      .setAudience(AUD)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(goodKey);
    expect((await get("/api/whoami", expired)).status).toBe(401);
  });

  it("rejects an unsigned token (alg none)", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({ email: "me@example.com", aud: AUD, iss: `https://${TEAM}` }),
    ).toString("base64url");
    expect((await get("/api/whoami", `${header}.${body}.`)).status).toBe(401);
  });
});

describe("service token", () => {
  const TOKEN = "x".repeat(40);
  const svc = createApp({
    pingDb: () => Promise.resolve(true),
    auth: serviceTokenOr(TOKEN, (c) => Promise.resolve(c.json({ error: "unauthenticated" }, 401))),
  });

  it("accepts the exact bearer token and rejects anything else", async () => {
    const ok = await svc.request("/api/rates", { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(ok.status).toBe(200);
    const bad = await svc.request("/api/rates", { headers: { Authorization: `Bearer ${TOKEN}y` } });
    expect(bad.status).toBe(401);
    expect((await svc.request("/api/rates")).status).toBe(401);
  });
});

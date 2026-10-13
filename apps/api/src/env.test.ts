import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const base = { DATABASE_URL: "postgres://u:p@db:5432/x" };

describe("loadEnv", () => {
  it("requires AUTH_MODE", () => {
    expect(() => loadEnv(base)).toThrow();
  });

  it("access mode needs non-empty team domain, audience and emails", () => {
    expect(() =>
      loadEnv({
        ...base,
        AUTH_MODE: "access",
        CF_ACCESS_TEAM_DOMAIN: "",
        CF_ACCESS_AUD: "a",
        ALLOWED_EMAILS: "me@x.fr",
      }),
    ).toThrow();
    expect(
      loadEnv({
        ...base,
        AUTH_MODE: "access",
        CF_ACCESS_TEAM_DOMAIN: "t.cloudflareaccess.com",
        CF_ACCESS_AUD: "a",
        ALLOWED_EMAILS: "me@x.fr",
      }).AUTH_MODE,
    ).toBe("access");
  });

  it("none mode needs nothing else", () => {
    expect(loadEnv({ ...base, AUTH_MODE: "none" }).AUTH_MODE).toBe("none");
  });
});

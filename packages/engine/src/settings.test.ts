import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@fc/shared";
import { settingsAt } from "./settings.js";

const timeline = [
  { validFrom: "2026-01-01", settings: DEFAULT_SETTINGS },
  { validFrom: "2026-07-01", settings: { tva: "assujetti" as const } },
  { validFrom: "2026-04-01", settings: { parts: 2, situationFamiliale: "couple" as const } },
];

describe("settingsAt", () => {
  it("applies dated patches in date order, regardless of array order", () => {
    expect(settingsAt(timeline, "2026-03-31").parts).toBe(1);
    expect(settingsAt(timeline, "2026-04-01").parts).toBe(2);
    expect(settingsAt(timeline, "2026-06-30").tva).toBe("franchise");
    const july = settingsAt(timeline, "2026-07-01");
    expect(july.tva).toBe("assujetti");
    expect(july.parts).toBe(2);
  });

  it("uses the first patch before its own date", () => {
    expect(settingsAt(timeline, "2025-06-01").tva).toBe("franchise");
  });
});

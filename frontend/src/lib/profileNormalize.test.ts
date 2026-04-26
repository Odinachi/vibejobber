import { describe, expect, it } from "vitest";
import type { Profile } from "./types";
import { formatProfileLocation, normalizeProfileFromRemote } from "./profileNormalize";

describe("normalizeProfileFromRemote", () => {
  it("returns base profile when raw is not an object", () => {
    const p = normalizeProfileFromRemote(null, "e@e.com");
    expect(p.email).toBe("e@e.com");
  });

  it("migrates legacy location to city", () => {
    const p = normalizeProfileFromRemote(
      { location: "Austin" },
      "e@e.com",
    );
    expect(p.city).toBe("Austin");
  });

  it("parses additional links with default label", () => {
    const p = normalizeProfileFromRemote(
      { additionalLinks: [{ url: "https://x.com" }] },
      "e@e.com",
    );
    expect(p.additionalLinks).toEqual([{ label: "Link", url: "https://x.com" }]);
  });
});

describe("formatProfileLocation", () => {
  it("combines city and country name for ISO-2", () => {
    const p = {
      city: "Berlin",
      country: "DE",
    } as Profile;
    expect(formatProfileLocation(p)).toBe("Berlin, Germany");
  });

  it("uses city only when no country", () => {
    const p = { city: "NYC", country: "" } as Profile;
    expect(formatProfileLocation(p)).toBe("NYC");
  });
});

import { describe, expect, it } from "vitest";
import { getCountrySelectOptions } from "./countries";

describe("getCountrySelectOptions", () => {
  it("returns non-empty options with 2-letter codes and English labels", () => {
    const options = getCountrySelectOptions();
    expect(options.length).toBeGreaterThan(10);
    for (const o of options) {
      expect(o.value).toMatch(/^[A-Z]{2}$/);
      expect(o.label.length).toBeGreaterThan(0);
    }
  });

  it("excludes ZZ and sorts by label", () => {
    const options = getCountrySelectOptions();
    expect(options.some((o) => o.value === "ZZ")).toBe(false);
    const labels = options.map((o) => o.label);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b, "en"));
    expect(labels).toEqual(sorted);
  });

  it("includes common countries", () => {
    const options = getCountrySelectOptions();
    const values = new Set(options.map((o) => o.value));
    expect(values.has("US")).toBe(true);
    expect(values.has("GB")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { emptyPreferences, emptyProfile } from "./userDefaults";

describe("emptyProfile", () => {
  it("sets email and clears structured fields", () => {
    const p = emptyProfile("u@example.com");
    expect(p.email).toBe("u@example.com");
    expect(p.workHistory).toEqual([]);
    expect(p.skills).toEqual([]);
    expect(p.sourceCvStoragePath).toBeNull();
  });
});

describe("emptyPreferences", () => {
  it("returns safe defaults", () => {
    const p = emptyPreferences();
    expect(p.desiredRoles).toEqual([]);
    expect(p.workModes).toEqual(["remote"]);
    expect(p.jobTypes).toEqual(["full-time"]);
    expect(p.salaryCurrency).toBe("USD");
  });
});

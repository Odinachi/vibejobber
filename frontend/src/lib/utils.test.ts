import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges class names and resolves tailwind conflicts", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("handles falsey values", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });
});

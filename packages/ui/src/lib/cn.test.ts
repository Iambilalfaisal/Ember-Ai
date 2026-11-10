import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("keeps the colour next to our custom text-detail size", () => {
    expect(cn("bg-coal text-paper", "text-detail")).toBe("bg-coal text-paper text-detail");
  });

  it("still lets a caller's class win", () => {
    expect(cn("text-sm", "text-detail")).toBe("text-detail");
    expect(cn("text-coal", "text-smoke")).toBe("text-smoke");
  });
});

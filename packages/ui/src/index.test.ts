import { describe, expect, it } from "vitest";
import { APP_NAME } from "./index";

describe("@ember/ui", () => {
  it("exports the product name", () => {
    expect(APP_NAME).toBe("Ember");
  });
});

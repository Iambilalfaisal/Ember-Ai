import { describe, expect, it } from "vitest";
import { APP_NAME } from "./index";

describe("@ember/ui", () => {
  it("names the product", () => {
    expect(APP_NAME).toBe("Ember");
  });
});

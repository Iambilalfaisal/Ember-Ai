import { describe, expect, it } from "vitest";
import { API_MODES } from "./index";

describe("@ember/api", () => {
  it("has a mock and a live mode", () => {
    expect(API_MODES).toEqual(["mock", "live"]);
  });
});

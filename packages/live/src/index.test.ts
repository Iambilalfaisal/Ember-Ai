import { describe, expect, it } from "vitest";
import { LIVE_PANEL_MIN_WIDTH_PX } from "./index";

describe("@ember/live", () => {
  it("works from 380 px wide", () => {
    expect(LIVE_PANEL_MIN_WIDTH_PX).toBe(380);
  });
});

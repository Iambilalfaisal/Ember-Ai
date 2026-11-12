import { describe, expect, it } from "vitest";
import {
  canOpen,
  HOME,
  NAV_ITEMS,
  navFor,
  navItemFor,
  SETTINGS_SECTIONS,
  titleFor,
} from "./routes";

// Every route in docs/frontend-plan.md section 3. A dynamic route uses a sample id.
const PLAN_ROUTES = [
  "/my-day",
  "/team",
  "/revival",
  "/pipeline",
  "/deals/meridian",
  "/contacts",
  "/tasks",
  "/calls",
  "/calls/call-blue-harbor-live",
  "/calls/call-blue-harbor-live/review",
  "/calls/call-blue-harbor-live/prep",
  "/live/call-blue-harbor-live",
  "/knowledge",
  "/knowledge/test",
  "/reports",
  "/settings",
  ...SETTINGS_SECTIONS.map((s) => `/settings/${s.slug}`),
];

describe("navigation by role", () => {
  it("shows a rep only what a rep can use", () => {
    const labels = navFor("rep").map((i) => i.label);
    expect(labels).toEqual([
      "My Day",
      "Calls",
      "Tasks",
      "Pipeline",
      "Contacts",
      "Revival queue",
      "Knowledge base",
    ]);
  });

  it("adds Team view, Reports and Settings for leads and admins", () => {
    for (const role of ["lead", "admin"] as const) {
      const labels = navFor(role).map((i) => i.label);
      expect(labels).toEqual(expect.arrayContaining(["Team view", "Reports", "Settings"]));
    }
  });

  it("lands each role somewhere it is allowed to be", () => {
    for (const role of ["rep", "lead", "admin"] as const) {
      expect(canOpen(HOME[role], role)).toBe(true);
      expect(navFor(role).some((i) => i.href === HOME[role])).toBe(true);
    }
  });
});

describe("routes", () => {
  it("gives every route in the plan a real title", () => {
    for (const path of PLAN_ROUTES) expect(titleFor(path), path).not.toBe("Ember");
  });

  it("lets an admin open every route", () => {
    for (const path of PLAN_ROUTES) expect(canOpen(path, "admin"), path).toBe(true);
  });

  it("keeps Team view, Reports and Settings away from reps, including their sub-pages", () => {
    for (const path of ["/team", "/reports", "/settings", "/settings/integrations"]) {
      expect(canOpen(path, "rep"), path).toBe(false);
      expect(canOpen(path, "lead"), path).toBe(true);
    }
    expect(canOpen("/knowledge/test", "rep")).toBe(true);
    expect(canOpen("/deals/meridian", "rep")).toBe(true);
  });

  it("keeps the right rail item lit on pages inside a section", () => {
    expect(navItemFor("/calls/call-1/prep")?.href).toBe("/calls");
    expect(navItemFor("/live/call-1")?.href).toBe("/calls");
    expect(navItemFor("/deals/meridian")?.href).toBe("/pipeline");
    expect(navItemFor("/settings/ai-usage")?.href).toBe("/settings");
    expect(navItemFor("/knowledge/test")?.href).toBe("/knowledge");
  });

  it("reaches every rail item from at least one role", () => {
    for (const item of NAV_ITEMS) expect(item.roles.length).toBeGreaterThan(0);
  });
});

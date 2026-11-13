import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import { Api, setupMockBackend } from "../../tests/helpers/mockApi";
import { useSession } from "@/lib/session";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

setupMockBackend();
beforeEach(() => {
  replace.mockClear();
  useSession.setState({ userId: null });
});

const renderHome = (userId: string | null = null) =>
  render(
    <Api userId={userId ?? "sam"}>
      <Home />
    </Api>,
  );

describe("the landing page", () => {
  it("has one main landmark and a headline that states the promise", () => {
    renderHome();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: /never lets a lead go quiet/ }),
    ).toBeInTheDocument();
  });

  it("offers the live demo from the top, the hero and the end", () => {
    renderHome();
    const demoLinks = screen
      .getAllByRole("link")
      .filter((a) => /demo/i.test(a.textContent ?? "") && a.getAttribute("href") === "/sign-in");
    expect(demoLinks.length).toBeGreaterThanOrEqual(3);
  });

  it("tells the story: the problem, five steps, the product areas and trust", () => {
    renderHome();
    for (const name of [
      /Deals are not lost in the meeting/,
      /One working day/,
      /Everything a sales team needs/,
      /Built so a company can trust it/,
      /See Ember run a real sales call/,
    ]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    const steps = screen.getAllByRole("listitem").filter((li) => li.classList.contains("lp-step"));
    expect(steps).toHaveLength(5);
    const product = screen
      .getByRole("heading", { name: /Everything a sales team needs/ })
      .closest("section") as HTMLElement;
    expect(within(product).getAllByRole("heading", { level: 3 })).toHaveLength(10);
  });

  it("describes the animated product picture for people who cannot see it", () => {
    renderHome();
    expect(screen.getByRole("img", { name: /Not confirmed/ })).toBeInTheDocument();
  });

  it("keeps a signed-out visitor on the page", async () => {
    renderHome();
    await new Promise((r) => setTimeout(r, 50));
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a signed-in person to their home page", async () => {
    useSession.setState({ userId: "priya" });
    renderHome("priya");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/team"));
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import { Api, setupMockBackend } from "../../tests/helpers/mockApi";
import { useSession } from "@/lib/session";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

setupMockBackend();
beforeEach(() => replace.mockClear());

const renderHome = () =>
  render(
    <Api userId="sam">
      <Home />
    </Api>,
  );

describe("the front door", () => {
  it("has a main landmark named after the product", () => {
    renderHome();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Ember" })).toBeInTheDocument();
  });

  it("sends a signed-out visitor to sign in", async () => {
    renderHome();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("sends a signed-in person to their home page", async () => {
    useSession.setState({ userId: "priya" });
    render(
      <Api userId="priya">
        <Home />
      </Api>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/team"));
  });
});

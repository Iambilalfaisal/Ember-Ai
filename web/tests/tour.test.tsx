import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedTour } from "@/features/demo";
import { TOUR_STEPS } from "@/features/demo/components/GuidedTour";
import { useSession } from "@/lib/session";
import { useUi } from "@/lib/ui";
import { Api, setupMockBackend } from "./helpers/mockApi";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/my-day",
}));

setupMockBackend();
beforeEach(() => {
  push.mockClear();
  useUi.setState({ tourStep: null });
  useSession.setState({ userId: "sam" });
});

const renderTour = () =>
  render(
    <Api userId="sam">
      <GuidedTour />
    </Api>,
  );

describe("Guided tour", () => {
  it("is closed until it is started", () => {
    renderTour();
    expect(screen.queryByRole("complementary", { name: "Guided tour" })).not.toBeInTheDocument();
  });

  it("walks the demo path, switching person and screen as it goes", async () => {
    const user = userEvent.setup();
    useUi.setState({ tourStep: 0 });
    renderTour();

    const tour = await screen.findByRole("complementary", { name: "Guided tour" });
    expect(tour).toHaveTextContent("Step 1 of 10");
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(push).toHaveBeenLastCalledWith("/my-day");
    expect(tour).toHaveTextContent("Step 2 of 10");

    // Jump to the team lead's step: the tour signs in as Priya and opens Team view.
    useUi.setState({ tourStep: 4 });
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(useSession.getState().userId).toBe("priya");
    expect(push).toHaveBeenLastCalledWith("/team");
  });

  it("ends from the close button and with Escape", async () => {
    const user = userEvent.setup();
    useUi.setState({ tourStep: 2 });
    renderTour();
    await user.click(await screen.findByRole("button", { name: "End tour" }));
    expect(useUi.getState().tourStep).toBeNull();

    useUi.setState({ tourStep: 2 });
    await user.keyboard("{Escape}");
    expect(useUi.getState().tourStep).toBeNull();
  });

  it("finishes on the last step", async () => {
    const user = userEvent.setup();
    useUi.setState({ tourStep: TOUR_STEPS.length - 1 });
    renderTour();
    await user.click(await screen.findByRole("button", { name: "Finish" }));
    expect(useUi.getState().tourStep).toBeNull();
  });
});

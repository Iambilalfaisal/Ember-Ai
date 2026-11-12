import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { CommandPalette } from "@/components/CommandPalette";
import { DemoControls, RoleSwitcher } from "@/features/demo";
import { SignInScreen } from "@/features/auth";
import { useSession } from "@/lib/session";
import { useUi } from "@/lib/ui";
import { Api, setupMockBackend } from "./helpers/mockApi";

const router = { push: vi.fn(), replace: vi.fn() };
let pathname = "/my-day";
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
}));

setupMockBackend();
beforeEach(() => {
  pathname = "/my-day";
  useUi.setState({ paletteOpen: false });
});

function Shell({ userId }: { userId: string }) {
  useSession.setState({ userId });
  return (
    <Api userId={userId}>
      <AppShell
        demoControls={<DemoControls />}
        roleSwitcher={<RoleSwitcher />}
        palette={<CommandPalette />}
      >
        <p>Page content</p>
      </AppShell>
    </Api>
  );
}

const navLabels = () =>
  within(screen.getByRole("navigation", { name: "Main" }))
    .getAllByRole("link")
    .map((l) => l.textContent);

describe("the shell", () => {
  it("shows a rep their own navigation, their count and their notifications", async () => {
    render(<Shell userId="sam" />);

    expect(await screen.findByRole("heading", { level: 1, name: "My Day" })).toBeInTheDocument();
    await waitFor(() => expect(navLabels()[0]).toBe("My Day4"));
    expect(navLabels().join()).not.toContain("Team view");
    expect(screen.getByRole("link", { name: /My Day/ })).toHaveAttribute("aria-current", "page");
    expect(
      await screen.findByRole("button", { name: "Notifications, 3 unread" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Demo data")).toBeInTheDocument();
  });

  it("shows a team lead Team view and Reports, with the count of opportunities needing attention", async () => {
    pathname = "/team";
    render(<Shell userId="priya" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Team view" })).toBeInTheDocument();
    await waitFor(() => expect(navLabels()).toContain("Team view5"));
    expect(navLabels()).toContain("Reports");
    expect(navLabels()).toContain("Settings");
    expect(screen.getByRole("link", { name: /Team view/ })).toHaveAttribute("aria-current", "page");
  });

  it("sends a rep who opens Team view back to My Day", async () => {
    pathname = "/team";
    render(<Shell userId="sam" />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/my-day"));
    expect(screen.queryByText("Page content")).not.toBeInTheDocument();
  });

  it("sends a signed-out visitor to sign in", async () => {
    useSession.setState({ userId: null });
    render(
      <Api userId="sam">
        <AppShell>
          <p>Page content</p>
        </AppShell>
      </Api>,
    );
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("switches role from the account menu and goes to that role's home", async () => {
    const user = userEvent.setup();
    render(<Shell userId="sam" />);

    await user.click(await screen.findByRole("button", { name: "Account menu for Sam Okafor" }));
    await user.click(await screen.findByRole("button", { name: /Priya Nair/ }));

    expect(useSession.getState().userId).toBe("priya");
    expect(router.push).toHaveBeenCalledWith("/team");
  });

  it("marks notifications as read", async () => {
    const user = userEvent.setup();
    render(<Shell userId="sam" />);

    await user.click(await screen.findByRole("button", { name: "Notifications, 3 unread" }));
    await user.click(await screen.findByRole("button", { name: "Mark all as read" }));

    expect(await screen.findByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("resets the demo from the demo controls", async () => {
    const user = userEvent.setup();
    render(<Shell userId="sam" />);

    await user.click(await screen.findByRole("button", { name: "Demo controls" }));
    expect(await screen.findByRole("button", { name: "Reset demo" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Simulate response time" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play the live call scenario" })).toHaveAttribute(
      "href",
      "/live/call-blue-harbor-live",
    );
  });
});

describe("the command palette", () => {
  async function openPalette() {
    const user = userEvent.setup();
    render(<Shell userId="sam" />);
    await screen.findByRole("heading", { level: 1, name: "My Day" });
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Search or jump to" });
    return { user, dialog };
  }

  it("opens with Ctrl+K and lists the pages a rep can open, but not Team view", async () => {
    const { dialog } = await openPalette();
    expect(within(dialog).getByRole("option", { name: "Pipeline" })).toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: /^Test console/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole("option", { name: "Team view" })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("option", { name: /Follow-up rules/ }),
    ).not.toBeInTheDocument();
  });

  it("finds an opportunity and opens it", async () => {
    const { user, dialog } = await openPalette();
    await user.type(within(dialog).getByRole("combobox"), "blue harbor");
    // The opportunity is listed before the call, and a click opens the opportunity.
    const matches = await within(dialog).findAllByRole("option", { name: /Blue Harbor Logistics/ });
    await user.click(matches[0]!);
    expect(router.push).toHaveBeenCalledWith("/deals/blue-harbor");
  });

  it("opens an upcoming call at its brief", async () => {
    const { user, dialog } = await openPalette();
    await user.type(within(dialog).getByRole("combobox"), "solvex");
    const calls = await within(dialog).findAllByRole("option", { name: /Solvex Manufacturing/ });
    await user.click(calls.find((o) => o.textContent?.includes("Brief"))!);
    expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/calls\/.+\/prep$/));
  });

  it("says so when nothing matches", async () => {
    const { user, dialog } = await openPalette();
    await user.type(within(dialog).getByRole("combobox"), "zzzzzz");
    expect(
      await within(dialog).findByText("Nothing matches. Try a company name or a page."),
    ).toBeInTheDocument();
  });

  it("gives a lead the settings sections and the other people to switch to", async () => {
    const user = userEvent.setup();
    render(<Shell userId="priya" />);
    await screen.findByRole("heading", { level: 1, name: "Team view" }).catch(() => undefined);
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Search or jump to" });
    expect(
      await within(dialog).findByRole("option", { name: /^Follow-up rules/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("option", { name: /^Switch to Sam Okafor/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("option", { name: /Switch to Priya/ }),
    ).not.toBeInTheDocument();
  });
});

describe("sign in", () => {
  it("lists the demo people and signs in as the one chosen", async () => {
    const user = userEvent.setup();
    render(
      <Api userId="sam">
        <SignInScreen />
      </Api>,
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    const buttons = await screen.findAllByRole("button", { name: /^Sign in as/ });
    expect(buttons).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: /Alex Morgan/ }));
    expect(useSession.getState().userId).toBe("alex");
    expect(router.push).toHaveBeenCalledWith("/knowledge");
  });
});

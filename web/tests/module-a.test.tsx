import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyDayScreen } from "@/features/my-day";
import { RevivalScreen } from "@/features/revival";
import { TeamScreen } from "@/features/team-view";
import { useSession } from "@/lib/session";
import { Api, setupMockBackend } from "./helpers/mockApi";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/my-day",
}));

setupMockBackend();
beforeEach(() => useSession.setState({ userId: null }));

function renderAs(userId: string, screen: React.ReactNode) {
  useSession.setState({ userId });
  return render(<Api userId={userId}>{screen}</Api>);
}

describe("My Day", () => {
  it("lists what needs the rep, each with a reason, and shows the first in the detail pane", async () => {
    renderAs("sam", <MyDayScreen />);

    expect(await screen.findByText("4 need you today")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Opportunities that need you" });
    expect(within(list).getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("region", { name: "Calls today" })).toBeInTheDocument();
    expect(screen.getByRole("article")).toBeInTheDocument();
  });

  it("shows the discovery notes with their extracted fields, and saves an edit", async () => {
    const user = userEvent.setup();
    renderAs("sam", <MyDayScreen />);
    await user.click(await screen.findByRole("button", { name: /Meridian/ }));

    await user.click(screen.getByRole("button", { name: "Discovery notes" }));
    expect(await screen.findByText("Original notes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit next action" }));
    const input = screen.getByRole("textbox", { name: "Next action" });
    await user.clear(input);
    await user.type(input, "Send the ROI case study{Enter}");

    expect(await screen.findByText("Send the ROI case study")).toBeInTheDocument();
  });

  it("opens the draft, sends it, and the item leaves the list while the count drops", async () => {
    const user = userEvent.setup();
    renderAs("sam", <MyDayScreen />);
    await user.click(await screen.findByRole("button", { name: /Meridian/ }));

    await user.click(screen.getByRole("button", { name: "View draft" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Facts used")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Send" }));
    expect(await within(sheet).findByRole("button", { name: "Sent" })).toBeDisabled();
    expect(within(sheet).getByText("Logged on the opportunity as an email.")).toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(await screen.findByText("3 need you today")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: /Meridian/ })).toBeNull(), {
      timeout: 3000,
    });
  });

  it("marks an item handled and snoozes another", async () => {
    const user = userEvent.setup();
    renderAs("sam", <MyDayScreen />);
    await screen.findByText("4 need you today");

    await user.click(screen.getByRole("button", { name: "Mark handled" }));
    expect(await screen.findByText("3 need you today")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Snooze 3 days" }));
    expect(await screen.findByText("2 need you today")).toBeInTheDocument();
  });

  it("regenerates the draft with new text", async () => {
    const user = userEvent.setup();
    renderAs("sam", <MyDayScreen />);
    await screen.findByText("4 need you today");
    await user.click(screen.getByRole("button", { name: "View draft" }));
    const sheet = await screen.findByRole("dialog");
    const box = await within(sheet).findByRole("textbox", { name: "Suggested reply" });
    const before = (box as HTMLTextAreaElement).value;

    await user.click(within(sheet).getByRole("button", { name: "Regenerate" }));
    await waitFor(() =>
      expect((within(sheet).getByRole("textbox") as HTMLTextAreaElement).value).not.toBe(before),
    );
  });

  it("invites action when nothing needs the rep", async () => {
    const user = userEvent.setup();
    renderAs("sam", <MyDayScreen />);
    await screen.findByText("4 need you today");
    for (let remaining = 4; remaining > 0; remaining--) {
      await user.click(screen.getByRole("button", { name: "Mark handled" }));
      await screen.findByText(
        `${remaining - 1 === 1 ? "1 needs" : `${remaining - 1} need`} you today`,
      );
    }
    expect(await screen.findByText("You're clear for today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Revival queue" })).toHaveAttribute(
      "href",
      "/revival",
    );
  });
});

describe("Team view", () => {
  it("lists opportunities that need attention and assigns an owner", async () => {
    const user = userEvent.setup();
    renderAs("priya", <TeamScreen />);

    const nimbus = (await screen.findByText("Nimbus Freight")).closest("tr");
    expect(nimbus).not.toBeNull();
    const owner = within(nimbus as HTMLElement).getByRole("combobox", {
      name: /Owner of Nimbus Freight/,
    });
    await user.selectOptions(owner, "jules");

    await waitFor(() =>
      expect(
        within(screen.getByText("Nimbus Freight").closest("tr") as HTMLElement).getByRole(
          "combobox",
        ),
      ).toHaveValue("jules"),
    );
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    renderAs("priya", <TeamScreen />);
    await screen.findByText("Nimbus Freight");

    await user.click(screen.getByRole("radio", { name: "Unassigned" }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    expect(screen.getByText("Nimbus Freight")).toBeInTheDocument();
  });

  it("says so when no opportunity matches", async () => {
    const user = userEvent.setup();
    renderAs("priya", <TeamScreen />);
    await screen.findByText("Nimbus Freight");
    await user.type(screen.getByRole("searchbox", { name: "Search opportunities" }), "zzzz");
    expect(await screen.findByText("Nothing matches")).toBeInTheDocument();
  });
});

describe("Revival queue", () => {
  it("shows the original need and a way back in, with a quiet note about who was left out", async () => {
    renderAs("priya", <RevivalScreen />);

    expect(await screen.findByText("Coastal Parcel Systems")).toBeInTheDocument();
    expect(screen.getAllByText("A way back in")).toHaveLength(3);
    expect(
      screen.getByText("1 opportunity left out because the contact declined or opted out."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Fernbridge/)).toBeNull();
  });

  it("shows a rep only their own opportunities", async () => {
    renderAs("sam", <RevivalScreen />);
    expect(await screen.findByText("Tarnhelm Industrial")).toBeInTheDocument();
    expect(screen.queryByText("Coastal Parcel Systems")).toBeNull();
  });
});

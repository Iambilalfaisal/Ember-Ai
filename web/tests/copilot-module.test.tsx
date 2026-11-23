import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityScreen, CopilotScreen } from "@/features/copilot";
import { BriefScreen } from "@/features/calls";
import { MyDayScreen } from "@/features/my-day";
import { PipelineScreen } from "@/features/pipeline";
import { SettingsScreen } from "@/features/settings";
import { DealDetailScreen } from "@/features/deals";
import { useSession } from "@/lib/session";
import { Api, setupMockBackend } from "./helpers/mockApi";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/copilot",
}));

setupMockBackend();
beforeEach(() => useSession.setState({ userId: null }));

function renderAs(userId: string, ui: React.ReactNode) {
  useSession.setState({ userId });
  return render(<Api userId={userId}>{ui}</Api>);
}

describe("the Copilot hub", () => {
  it("greets the rep and shows what needs them, with the loop and the waiting suggestions", async () => {
    renderAs("sam", <CopilotScreen />);
    expect(await screen.findByText(/Good (morning|afternoon|evening), Sam/)).toBeInTheDocument();
    expect(screen.getByText(/4 opportunities need you today/)).toBeInTheDocument();
    const loop = screen.getByRole("region", { name: "How Ember works" });
    expect(within(loop).getByText("Nothing changes until you say so")).toBeInTheDocument();
    expect(screen.getAllByText("3 waiting for your decision").length).toBeGreaterThan(0);
  });

  it("applies a suggestion only when it is approved, and records who approved it", async () => {
    const user = userEvent.setup();
    renderAs("sam", <CopilotScreen />);
    const card = (await screen.findByText("Solvex has gone quiet after the proposal")).closest(
      "li",
    )!;
    expect(within(card).getByText(/If you approve:/)).toBeInTheDocument();
    expect(
      within(card).getByText(/Call Solvex's legal lead about the order form/),
    ).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Approved")).toBeInTheDocument();

    const recent = await screen.findByRole("list", { name: "Recent activity" });
    expect(
      await within(recent).findByText("Next action: Call Solvex's legal lead about the order form"),
    ).toBeInTheDocument();
    expect(
      within(recent).getAllByText(/Suggested by Ember, approved by Sam Okafor/).length,
    ).toBeGreaterThan(0);
  });

  it("lets the rep set a suggestion aside without changing anything", async () => {
    const user = userEvent.setup();
    renderAs("sam", <CopilotScreen />);
    const card = (await screen.findByText("Ferro is waiting on the security answers")).closest(
      "li",
    )!;
    await user.click(within(card).getByRole("button", { name: "Not now" }));
    await waitFor(() =>
      expect(screen.getAllByText("2 waiting for your decision").length).toBeGreaterThan(0),
    );
    expect(
      screen.getByText(/Ferro Analytics/, { selector: "span.font-medium" }),
    ).toBeInTheDocument();
  });

  it("opens the digest settings and saves a choice", async () => {
    const user = userEvent.setup();
    renderAs("sam", <CopilotScreen />);
    await user.click(await screen.findByRole("button", { name: "Digest settings" }));
    const dialog = await screen.findByRole("dialog");
    const email = await within(dialog).findByRole("switch", { name: "Morning digest by email" });
    expect(email).not.toBeChecked();
    await user.click(email);
    await waitFor(() => expect(email).toBeChecked());
  });

  it("gives a team lead the assignment suggestion, and approving it puts Nimbus in Jules' day", async () => {
    const user = userEvent.setup();
    const first = renderAs("priya", <CopilotScreen />);
    const card = (await screen.findByText("Nimbus Freight has had no owner for 3 days")).closest(
      "li",
    )!;
    await user.click(within(card).getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Approved")).toBeInTheDocument();
    first.unmount();

    renderAs("jules", <MyDayScreen />);
    expect((await screen.findAllByText("Nimbus Freight")).length).toBeGreaterThan(0);
  });
});

describe("the activity log", () => {
  it("shows a rep their own history, newest first, and filters by who suggested it", async () => {
    const user = userEvent.setup();
    renderAs("sam", <ActivityScreen />);
    const log = await screen.findByRole("list", { name: "Activity log" });
    expect(within(log).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(within(log).queryByText(/Assigned to/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Done by hand" }));
    // Sam has only approved suggestions so far, so nothing was done by hand.
    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
  });

  it("shows a lead everyone's entries", async () => {
    renderAs("priya", <ActivityScreen />);
    const log = await screen.findByRole("list", { name: "Activity log" });
    expect(within(log).getAllByText(/approved by (Sam Okafor|Jules Park)/).length).toBeGreaterThan(
      0,
    );
  });
});

describe("log a call", () => {
  it("records a WhatsApp call, turns promises into tasks and writes the log", async () => {
    const user = userEvent.setup();
    renderAs("sam", <DealDetailScreen dealId="meridian" />);
    await user.click(await screen.findByRole("button", { name: "Log a call" }));
    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Log call" });
    expect(submit).toBeDisabled();
    await user.selectOptions(within(dialog).getByRole("combobox"), "whatsapp");
    await user.type(
      within(dialog).getByLabelText("What was said"),
      "Priya wants the board numbers by Friday",
    );
    await user.type(within(dialog).getByLabelText(/Promises made/), "Send ROI numbers by Friday");
    await user.click(submit);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const activity = await screen.findByRole("list", { name: "Activity" });
    expect(
      await within(activity).findByText(/WhatsApp call: Priya wants the board numbers by Friday/),
    ).toBeInTheDocument();
  });
});

describe("signals on existing screens", () => {
  it("shows real-contact recency and days in stage on each My Day row", async () => {
    renderAs("sam", <MyDayScreen />);
    const list = await screen.findByRole("list", { name: "Opportunities that need you" });
    expect(within(list).getAllByText(/Last call or email \d+ days? ago/).length).toBe(4);
    expect(within(list).getAllByText(/\d+d in stage/).length).toBe(4);
  });

  it("flags deals without a next action on the board", async () => {
    renderAs("priya", <PipelineScreen />);
    expect(await screen.findByText("Nimbus Freight")).toBeInTheDocument();
    expect(screen.getAllByText("No next action").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\d+d in stage/).length).toBeGreaterThan(3);
  });

  it("names who is on the call and the part each plays in the decision", async () => {
    renderAs("sam", <BriefScreen callId="call-blue-harbor-live" />);
    const who = await screen.findByRole("region", { name: "Who is on the call" });
    expect(within(who).getByText("Nadia Okoro")).toBeInTheDocument();
    expect(within(who).getByText("Decision maker")).toBeInTheDocument();
    expect(within(who).getByText("Influencer")).toBeInTheDocument();
  });
});

describe("company defaults", () => {
  it("lets an admin change the time zone and working days", async () => {
    const user = userEvent.setup();
    renderAs("alex", <SettingsScreen slug="company-defaults" />);
    const zone = await screen.findByRole("combobox", { name: "Time zone" });
    const save = screen.getByRole("button", { name: "Save defaults" });
    expect(save).toBeDisabled();
    await user.selectOptions(zone, "Europe/London");
    expect(save).toBeEnabled();
    await user.click(screen.getByRole("checkbox", { name: "Sat" }));
    await user.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(screen.getByRole("checkbox", { name: "Sat" })).toBeChecked();
  });
});

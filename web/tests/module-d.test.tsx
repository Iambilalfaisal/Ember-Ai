import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportsScreen } from "@/features/reports";
import { SettingsScreen } from "@/features/settings";
import { useSession } from "@/lib/session";
import { Api, setupMockBackend } from "./helpers/mockApi";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/settings/follow-up-rules",
}));

setupMockBackend();
beforeEach(() => useSession.setState({ userId: null }));

function renderAs(userId: string, ui: React.ReactNode) {
  useSession.setState({ userId });
  return render(<Api userId={userId}>{ui}</Api>);
}

describe("Reports", () => {
  it("shows the latest week and a chart for each pilot metric", async () => {
    renderAs("priya", <ReportsScreen />);

    const latest = await screen.findByRole("region", { name: "Latest week" });
    expect(within(latest).getByText("Answers used")).toBeInTheDocument();
    expect(within(latest).getByText("Overdue follow-ups")).toBeInTheDocument();

    for (const title of [
      "Answers used",
      "Answers correct",
      "Technical questions handled",
      "Time from call end to follow-up",
      "Overdue follow-ups by rep",
      "Deals moving to proposal",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(
      screen.getAllByRole("group", { name: /first week|in the first/i }).length,
    ).toBeGreaterThan(0);
  });

  it("names both reps in the overdue chart and shows a legend", async () => {
    renderAs("priya", <ReportsScreen />);
    const chart = (
      await screen.findByRole("heading", { name: "Overdue follow-ups by rep" })
    ).closest("figure");
    const legend = within(chart as HTMLElement).getByRole("list", { name: "Legend" });
    expect(within(legend).getByText("Sam Okafor")).toBeInTheDocument();
    expect(within(legend).getByText("Jules Park")).toBeInTheDocument();
  });

  it("reads out a week with the arrow keys", async () => {
    const user = userEvent.setup();
    renderAs("priya", <ReportsScreen />);
    const chart = (await screen.findByRole("heading", { name: "Answers used" })).closest("figure");
    const plot = within(chart as HTMLElement).getByRole("group");
    plot.focus();
    await user.keyboard("{ArrowLeft}");
    expect(await within(chart as HTMLElement).findByRole("status")).toHaveTextContent(/Week of/);
  });

  it("offers the same data as a table", async () => {
    const user = userEvent.setup();
    renderAs("priya", <ReportsScreen />);
    await screen.findByRole("region", { name: "Latest week" });

    await user.click(screen.getByRole("radio", { name: "Table" }));
    const table = screen.getByRole("table", { name: "Pilot metrics by week" });
    expect(within(table).getAllByRole("row")).toHaveLength(7);
    expect(screen.queryByRole("heading", { name: "Answers correct" })).not.toBeInTheDocument();
  });
});

describe("Settings", () => {
  it("lets an admin change a follow-up rule and save it", async () => {
    const user = userEvent.setup();
    renderAs("alex", <SettingsScreen slug="follow-up-rules" />);

    const proposal = await screen.findByLabelText("Proposal");
    expect(proposal).toHaveValue("7");
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    await user.clear(proposal);
    await user.type(proposal, "10");
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled(),
    );
    expect(screen.getByLabelText("Proposal")).toHaveValue("10");
  });

  it("rejects a rule that is not a number of days", async () => {
    const user = userEvent.setup();
    renderAs("alex", <SettingsScreen slug="follow-up-rules" />);
    const field = await screen.findByLabelText("Discovery");
    await user.clear(field);
    await user.type(field, "abc");
    expect(screen.getByRole("alert")).toHaveTextContent("whole number of days");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("shows a team lead the rules without a way to change them", async () => {
    renderAs("priya", <SettingsScreen slug="follow-up-rules" />);
    expect(await screen.findByLabelText("Proposal")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.getByText("Only an admin can change these settings.")).toBeInTheDocument();
  });

  it("changes consent and retention", async () => {
    const user = userEvent.setup();
    renderAs("alex", <SettingsScreen slug="consent-and-retention" />);

    expect(await screen.findByRole("radio", { name: /Announce/ })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /Required/ }));
    await user.selectOptions(screen.getByLabelText("Keep transcripts for"), "180");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled(),
    );
    expect(screen.getByRole("radio", { name: /Required/ })).toBeChecked();
  });

  it("shows which integrations are connected", async () => {
    renderAs("alex", <SettingsScreen slug="integrations" />);
    const teams = (await screen.findByText("Microsoft Teams")).closest("li") as HTMLElement;
    expect(within(teams).getByText("Connected")).toBeInTheDocument();
    const clickup = screen.getByText("ClickUp").closest("li") as HTMLElement;
    expect(within(clickup).getByText("Not connected")).toBeInTheDocument();
  });

  it("lists users with their roles", async () => {
    renderAs("alex", <SettingsScreen slug="users-and-roles" />);
    const table = await screen.findByRole("table", { name: "Users and roles" });
    expect(within(table).getByText("Alex Morgan")).toBeInTheDocument();
    expect(within(table).getAllByText("Sales rep")).toHaveLength(2);
  });

  it("shows AI usage and cost per answer", async () => {
    renderAs("alex", <SettingsScreen slug="ai-usage" />);
    expect(await screen.findByText("$41.80")).toBeInTheDocument();
    expect(screen.getByText("312")).toBeInTheDocument();
    expect(screen.getByText("$0.13")).toBeInTheDocument();
  });
});

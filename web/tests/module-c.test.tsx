import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactsScreen } from "@/features/contacts";
import { DealDetailScreen } from "@/features/deals";
import { PipelineScreen } from "@/features/pipeline";
import { TasksScreen } from "@/features/tasks";
import { useSession } from "@/lib/session";
import { Api, setupMockBackend } from "./helpers/mockApi";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/pipeline",
}));

setupMockBackend();
beforeEach(() => useSession.setState({ userId: null }));

function renderAs(userId: string, ui: React.ReactNode) {
  useSession.setState({ userId });
  return render(<Api userId={userId}>{ui}</Api>);
}

describe("Pipeline", () => {
  it("shows a column per stage with its count and total", async () => {
    renderAs("priya", <PipelineScreen />);

    const proposal = await screen.findByRole("region", { name: "Proposal" });
    expect(within(proposal).getByRole("banner")).toHaveTextContent("1 deal, $210,000");
    expect(within(proposal).getByRole("link", { name: "Solvex Manufacturing" })).toHaveAttribute(
      "href",
      "/deals/solvex",
    );
    const qualified = screen.getByRole("region", { name: "Qualified" });
    expect(within(qualified).getAllByRole("listitem").length).toBeGreaterThan(1);
    expect(screen.getByRole("region", { name: "Closed won" })).toHaveTextContent(
      "Drop a deal here.",
    );
    // Every tile has a handle that keyboard and screen reader users can pick up.
    expect(screen.getByRole("button", { name: "Move Solvex Manufacturing" })).toBeInTheDocument();
  });

  it("keeps revival and declined opportunities out of the pipeline", async () => {
    renderAs("priya", <PipelineScreen />);
    await screen.findByRole("region", { name: "Proposal" });
    expect(screen.queryByText("Coastal Parcel Systems")).not.toBeInTheDocument();
    expect(screen.queryByText("Fernbridge Health")).not.toBeInTheDocument();
  });

  it("switches to a table of the same data, and filters it", async () => {
    const user = userEvent.setup();
    renderAs("priya", <PipelineScreen />);
    await screen.findByRole("region", { name: "Proposal" });

    await user.click(screen.getByRole("radio", { name: "List" }));
    const table = await screen.findByRole("table", { name: "Opportunities" });
    expect(within(table).getByRole("link", { name: "Meridian Robotics" })).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search opportunities" }), "ferro");
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2),
    );
    expect(screen.getByRole("link", { name: "Ferro Analytics" })).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    renderAs("priya", <PipelineScreen />);
    await screen.findByRole("region", { name: "Proposal" });
    await user.type(screen.getByRole("searchbox", { name: "Search opportunities" }), "zzzz");
    expect(await screen.findByText("No opportunities match")).toBeInTheDocument();
  });

  it("shows a rep only their own opportunities and no owner filter", async () => {
    renderAs("sam", <PipelineScreen />);
    await screen.findByRole("region", { name: "Proposal" });
    expect(screen.queryByText("Highline Freight")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
  });
});

describe("Deal detail", () => {
  it("shows the header, activity, contacts, tasks and the upcoming call", async () => {
    renderAs("sam", <DealDetailScreen dealId="blue-harbor" />);

    expect(
      await screen.findByRole("heading", { name: "Blue Harbor Logistics" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByText("Tom Reyes")).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Tasks for this opportunity" })).getByText(
        "Send the integration timeline to Tom",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open brief" })).toHaveAttribute(
      "href",
      "/calls/call-blue-harbor-live/prep",
    );
  });

  it("moves the opportunity to a new stage and records it on the timeline", async () => {
    const user = userEvent.setup();
    renderAs("sam", <DealDetailScreen dealId="blue-harbor" />);
    await screen.findByRole("heading", { name: "Blue Harbor Logistics" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Stage" }), "proposal");

    const activity = screen.getByRole("list", { name: "Activity" });
    expect(await within(activity).findByText("Moved to Proposal")).toBeInTheDocument();
  });

  it("lets the rep fix the next action in place", async () => {
    const user = userEvent.setup();
    renderAs("sam", <DealDetailScreen dealId="blue-harbor" />);
    await screen.findByRole("heading", { name: "Blue Harbor Logistics" });

    await user.click(screen.getByRole("button", { name: "Edit next action" }));
    const input = screen.getByRole("textbox", { name: "Next action" });
    await user.clear(input);
    await user.type(input, "Book the integration workshop{Enter}");
    expect(await screen.findByText("Book the integration workshop")).toBeInTheDocument();
  });

  it("only offers an owner control to a team lead", async () => {
    const { unmount } = renderAs("sam", <DealDetailScreen dealId="blue-harbor" />);
    await screen.findByRole("heading", { name: "Blue Harbor Logistics" });
    expect(screen.queryByRole("combobox", { name: "Owner" })).not.toBeInTheDocument();
    unmount();

    renderAs("priya", <DealDetailScreen dealId="blue-harbor" />);
    expect(await screen.findByRole("combobox", { name: "Owner" })).toBeInTheDocument();
  });

  it("explains when an opportunity can't be opened", async () => {
    renderAs("sam", <DealDetailScreen dealId="highline" />);
    expect(await screen.findByText("Couldn't open this opportunity")).toBeInTheDocument();
  });
});

describe("Contacts", () => {
  it("lists contacts with their company, and filters by search", async () => {
    const user = userEvent.setup();
    renderAs("sam", <ContactsScreen />);

    const table = await screen.findByRole("table", { name: "Contacts" });
    expect(within(table).getByRole("link", { name: "Meridian Robotics" })).toHaveAttribute(
      "href",
      "/deals/meridian",
    );
    expect(within(table).getAllByRole("link", { name: /@/ })[0]).toHaveAttribute(
      "href",
      expect.stringMatching(/^mailto:/),
    );

    await user.type(screen.getByRole("searchbox", { name: "Search contacts" }), "tom");
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2),
    );
    expect(screen.getByText("Tom Reyes")).toBeInTheDocument();
  });

  it("says so when no one matches", async () => {
    const user = userEvent.setup();
    renderAs("sam", <ContactsScreen />);
    await screen.findByRole("table", { name: "Contacts" });
    await user.type(screen.getByRole("searchbox", { name: "Search contacts" }), "zzzz");
    expect(await screen.findByText("No contacts match")).toBeInTheDocument();
  });
});

describe("Tasks", () => {
  it("lists open tasks, flags overdue ones, and checks one off", async () => {
    const user = userEvent.setup();
    renderAs("sam", <TasksScreen />);

    const list = await screen.findByRole("list", { name: "Tasks" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    const overdue = within(list).getByText("Send the integration timeline to Tom").closest("li");
    expect(within(overdue as HTMLElement).getByText("Overdue")).toBeInTheDocument();

    await user.click(
      within(list).getByRole("checkbox", { name: "Send the integration timeline to Tom" }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem"),
      ).toHaveLength(3),
    );

    await user.click(screen.getByRole("radio", { name: "Done" }));
    expect(
      await screen.findByRole("checkbox", { name: "Send the integration timeline to Tom" }),
    ).toBeChecked();
  });

  it("invites action when nothing is open or done", async () => {
    const user = userEvent.setup();
    renderAs("jules", <TasksScreen />);

    // Jules has two open tasks and none finished.
    await user.click(await screen.findByRole("radio", { name: "Done" }));
    expect(await screen.findByText("Nothing is done yet")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Open" }));
    await user.click(
      await screen.findByRole("checkbox", { name: "Send the revised order form to Rosa" }),
    );
    await user.click(
      await screen.findByRole("checkbox", { name: "Book the contract review call" }),
    );
    expect(await screen.findByText("No open tasks")).toBeInTheDocument();
  });
});

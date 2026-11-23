import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DealDetailScreen } from "@/features/deals";
import { PipelineScreen } from "@/features/pipeline";
import { SettingsScreen } from "@/features/settings";
import { parseDealsCsv } from "@/lib/csv";
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

describe("closing an opportunity", () => {
  it("asks why, and will not close until a reason is chosen", async () => {
    const user = userEvent.setup();
    renderAs("sam", <DealDetailScreen dealId="blue-harbor" />);
    await screen.findByRole("heading", { name: "Blue Harbor Logistics" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Stage" }), "lost");
    const dialog = await screen.findByRole("dialog");
    const close = within(dialog).getByRole("button", { name: "Close as lost" });
    expect(close).toBeDisabled();

    await user.selectOptions(within(dialog).getByRole("combobox"), "Budget");
    await user.click(close);
    expect(await screen.findByText("Budget")).toBeInTheDocument();
    const activity = screen.getByRole("list", { name: "Activity" });
    expect(await within(activity).findByText(/Moved to Closed lost: Budget/)).toBeInTheDocument();
  });

  it("keeps the deal open when the rep backs out", async () => {
    const user = userEvent.setup();
    renderAs("sam", <DealDetailScreen dealId="blue-harbor" />);
    await screen.findByRole("heading", { name: "Blue Harbor Logistics" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Stage" }), "won");
    await user.click(await screen.findByRole("button", { name: "Keep it open" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("combobox", { name: "Stage" })).toHaveValue("qualified");
  });
});

describe("contact opt-out", () => {
  it("marks a contact opted out and offers to undo it", async () => {
    const user = userEvent.setup();
    renderAs("sam", <DealDetailScreen dealId="meridian" />);
    await screen.findByRole("heading", { name: "Meridian Robotics" });

    await user.click(await screen.findByRole("button", { name: "Mark opted out" }));
    expect(await screen.findByText("Opted out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow contact again" })).toBeInTheDocument();
  });

  it("lets the rep set a contact's role", async () => {
    const user = userEvent.setup();
    renderAs("sam", <DealDetailScreen dealId="meridian" />);
    const role = await screen.findByRole("combobox", { name: /^Role of/ });
    await user.selectOptions(role, "decision_maker");
    await waitFor(() => expect(role).toHaveValue("decision_maker"));
  });
});

describe("adding opportunities", () => {
  it("quick-adds one opportunity", async () => {
    const user = userEvent.setup();
    renderAs("sam", <PipelineScreen />);
    await user.click(await screen.findByRole("button", { name: "Add opportunity" }));
    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Add opportunity" });
    expect(submit).toBeDisabled();

    await user.type(within(dialog).getByLabelText("Company"), "Quill and Co");
    await user.type(within(dialog).getByLabelText("Contact name"), "Ines Ray");
    await user.type(within(dialog).getByLabelText("Contact email"), "ines@quill.example");
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Quill and Co")).toBeInTheDocument();
  });

  it("imports a CSV and reports the rows it skipped", async () => {
    const user = userEvent.setup();
    renderAs("sam", <PipelineScreen />);
    await user.click(await screen.findByRole("button", { name: "Add opportunity" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Import CSV" }));
    await user.click(within(dialog).getByRole("textbox", { name: "CSV" }));
    await user.paste(
      "company,contact name,contact email\nAcme Two,Al One,al@acmetwo.example\nBroken Co,Bo Two,not-an-email",
    );
    expect(await within(dialog).findByText("2 rows ready to import.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Import" }));
    expect(await within(dialog).findByText("1 added, 1 skipped.")).toBeInTheDocument();
    expect(within(dialog).getByText(/Row 2: Email address is not valid/)).toBeInTheDocument();
  });

  it("explains a CSV that is missing columns", async () => {
    const user = userEvent.setup();
    renderAs("sam", <PipelineScreen />);
    await user.click(await screen.findByRole("button", { name: "Add opportunity" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Import CSV" }));
    await user.click(within(dialog).getByRole("textbox", { name: "CSV" }));
    await user.paste("company,value\nAcme,10");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/contact email/);
  });
});

describe("CSV parsing", () => {
  it("handles quotes, aliases and money formatting", () => {
    const { rows, problems } = parseDealsCsv(
      'Account,Contact,Email,Amount\n"Smith, Jones & Co",Ann Lee,ann@sj.example,"$12,500"',
    );
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({
      company: "Smith, Jones & Co",
      contactName: "Ann Lee",
      value: 12500,
      currency: "USD",
    });
  });
});

describe("Sources and reasons", () => {
  it("lets an admin add a lost reason and save it", async () => {
    const user = userEvent.setup();
    renderAs("alex", <SettingsScreen slug="sources-and-reasons" />);
    const input = await screen.findByLabelText("Add to Lost reasons");
    await user.type(input, "Merged with another company");
    await user.click(
      within(screen.getByRole("region", { name: "Lost reasons" })).getByRole("button", {
        name: "Add",
      }),
    );
    const save = screen.getByRole("button", { name: "Save lost reasons" });
    expect(save).toBeEnabled();
    await user.click(save);
    // Once saved, the list matches the server again and there is nothing left to save.
    await waitFor(() => expect(save).toBeDisabled());
    expect(screen.getByText("Merged with another company")).toBeInTheDocument();
  });

  it("is read-only for a team lead", async () => {
    renderAs("priya", <SettingsScreen slug="sources-and-reasons" />);
    expect(await screen.findByText("Only an admin can change these settings.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save sources" })).not.toBeInTheDocument();
  });
});

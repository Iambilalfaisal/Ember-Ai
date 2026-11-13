import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeScreen, TestConsoleScreen } from "@/features/knowledge";
import { useSession } from "@/lib/session";
import { Api, setupMockBackend } from "./helpers/mockApi";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/knowledge",
}));

setupMockBackend();
beforeEach(() => useSession.setState({ userId: null }));

function renderAs(userId: string, ui: React.ReactNode) {
  useSession.setState({ userId });
  return render(<Api userId={userId}>{ui}</Api>);
}

const rowOf = (name: string) => screen.getByRole("button", { name }).closest("tr") as HTMLElement;

describe("Documents", () => {
  it("lists every version with its status, and the quality scorecard for an admin", async () => {
    renderAs("alex", <KnowledgeScreen />);

    const table = await screen.findByRole("table", { name: "Documents" });
    expect(within(table).getAllByText("Pricing guide")).toHaveLength(2);
    expect(within(rowOf("Open Pricing guide v5")).getByText("v5")).toBeInTheDocument();
    expect(within(rowOf("Open Pricing guide v4")).getByText("Active")).toBeInTheDocument();

    const scorecard = await screen.findByRole("region", { name: "Quality scorecard" });
    expect(within(scorecard).getByText("91%")).toBeInTheDocument();
    expect(within(scorecard).getByText("95%")).toBeInTheDocument();
    expect(within(scorecard).getByText("1.2 s")).toBeInTheDocument();
    expect(within(scorecard).getByText("2.2 s")).toBeInTheDocument();
  });

  it("filters to inactive documents", async () => {
    const user = userEvent.setup();
    renderAs("alex", <KnowledgeScreen />);
    await screen.findByRole("table", { name: "Documents" });

    await user.click(screen.getByRole("radio", { name: "Inactive" }));
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(
      within(rows[1] as HTMLElement).getByText("Implementation checklist"),
    ).toBeInTheDocument();
  });

  it("deactivates an outdated document after confirming, and can activate it again", async () => {
    const user = userEvent.setup();
    renderAs("alex", <KnowledgeScreen />);
    await screen.findByRole("table", { name: "Documents" });

    await user.click(screen.getByRole("button", { name: "Deactivate Pricing guide v4" }));
    await user.click(await screen.findByRole("button", { name: "Deactivate" }));

    await waitFor(() =>
      expect(within(rowOf("Open Pricing guide v4")).getByText("Inactive")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Activate Pricing guide v4" }));
    await waitFor(() =>
      expect(within(rowOf("Open Pricing guide v4")).getByText("Active")).toBeInTheDocument(),
    );
  });

  it("replaces a document with a new version", async () => {
    const user = userEvent.setup();
    renderAs("alex", <KnowledgeScreen />);
    await screen.findByRole("table", { name: "Documents" });

    await user.click(screen.getByRole("button", { name: "Replace Pricing guide v5" }));
    await user.click(await screen.findByRole("button", { name: "Replace" }));

    expect(await screen.findByText("v6")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(rowOf("Open Pricing guide v5")).getByText("Inactive")).toBeInTheDocument(),
    );
  });

  it("uploads a new document", async () => {
    const user = userEvent.setup();
    renderAs("alex", <KnowledgeScreen />);
    await screen.findByRole("table", { name: "Documents" });

    await user.click(screen.getByRole("button", { name: "Upload document" }));
    const upload = screen.getByRole("button", { name: "Upload" });
    expect(upload).toBeDisabled();
    await user.type(screen.getByLabelText("Title"), "Onboarding guide");
    await user.click(upload);

    expect(
      await screen.findByRole("button", { name: "Open Onboarding guide v1" }),
    ).toBeInTheDocument();
  });

  it("opens a document's sections in a sheet", async () => {
    const user = userEvent.setup();
    renderAs("alex", <KnowledgeScreen />);
    await screen.findByRole("table", { name: "Documents" });

    await user.click(screen.getByRole("button", { name: "Open Integration guide v3" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText(/three phases/i)).toBeInTheDocument();
  });

  it("gives a rep a read-only list with no scorecard", async () => {
    renderAs("sam", <KnowledgeScreen />);
    await screen.findByRole("table", { name: "Documents" });
    expect(screen.queryByRole("button", { name: "Upload document" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Deactivate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Quality scorecard" })).not.toBeInTheDocument();
  });
});

describe("Test console", () => {
  it("answers from a document and shows its source and confidence", async () => {
    const user = userEvent.setup();
    renderAs("alex", <TestConsoleScreen />);

    await user.type(screen.getByLabelText("Ask a question"), "How long does integration take?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    const answer = await screen.findByRole("article", { name: "Answer" });
    // The answer streams in word by word, so wait for it to finish.
    await waitFor(() => expect(answer).toHaveTextContent(/three phases/i), { timeout: 5000 });
    expect(
      screen.getByRole("button", { name: /Integration guide v3, section 2/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^\d+%$/)).toBeInTheDocument();
  });

  it("returns Not confirmed with a holding line when no document says", async () => {
    const user = userEvent.setup();
    renderAs("alex", <TestConsoleScreen />);

    await user.click(screen.getByRole("button", { name: "Do you have SOC 2 certification?" }));

    const card = await screen.findByRole("article", { name: "Not confirmed" });
    expect(card).toHaveTextContent("I want to confirm that with our team");
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("does not ask an empty question", () => {
    renderAs("alex", <TestConsoleScreen />);
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
  });
});

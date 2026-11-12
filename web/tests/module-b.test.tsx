import { api, configureApi } from "@ember/api";
import { initialLiveState, liveReducer, LivePanel } from "@ember/live";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BriefScreen, CallDetailScreen, CallsScreen, ReviewScreen } from "@/features/calls";
import { useSession } from "@/lib/session";
import { Api, setupMockBackend } from "./helpers/mockApi";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/calls",
}));

setupMockBackend();
beforeEach(() => useSession.setState({ userId: null }));

function renderAs(userId: string, ui: React.ReactNode) {
  useSession.setState({ userId });
  return render(<Api userId={userId}>{ui}</Api>);
}

/** Ends the Blue Harbor call the way the live screen does, so there is a draft summary to review. */
async function endBlueHarbor() {
  configureApi({ baseUrl: "http://localhost/api", getUserId: () => "sam" });
  await api.calls.end("call-blue-harbor-live", {
    durationMin: 1,
    transcript: [
      { id: "seg-1", speaker: "client", name: "Tom Reyes", text: "How long?", atSec: 2 },
    ],
    cards: [
      {
        id: "card-security",
        kind: "not_confirmed",
        text: "I will confirm that in writing today.",
        source: null,
        atSec: 14,
        verdict: null,
      },
    ],
  });
}

describe("Calls", () => {
  it("lists calls and sends each to the right place", async () => {
    const user = userEvent.setup();
    renderAs("sam", <CallsScreen />);

    const list = await screen.findByRole("list", { name: "Calls" });
    expect(within(list).getByRole("link", { name: /Open brief for Blue Harbor/ })).toHaveAttribute(
      "href",
      "/calls/call-blue-harbor-live/prep",
    );
    expect(within(list).getByRole("link", { name: /Open call for Blue Harbor/ })).toHaveAttribute(
      "href",
      "/calls/call-blue-harbor-intro",
    );

    await user.click(screen.getByRole("radio", { name: "Completed" }));
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Open brief for/ })).not.toBeInTheDocument(),
    );
  });

  it("says so when nothing matches the search", async () => {
    const user = userEvent.setup();
    renderAs("sam", <CallsScreen />);
    await screen.findByRole("list", { name: "Calls" });
    await user.type(screen.getByRole("searchbox", { name: "Search calls" }), "zzzz");
    expect(await screen.findByText("No calls match")).toBeInTheDocument();
  });

  it("shows a completed call's summary, answers and transcript", async () => {
    const user = userEvent.setup();
    renderAs("sam", <CallDetailScreen callId="call-blue-harbor-intro" />);

    expect(await screen.findByRole("heading", { name: "Intro call" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Answers" }));
    expect(await screen.findByText(/ready-made connectors/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Transcript" }));
    expect(await screen.findByRole("list", { name: "Transcript" })).toBeInTheDocument();
  });
});

describe("Call brief", () => {
  it("shows the plan and lets the rep start the scripted call", async () => {
    renderAs("sam", <BriefScreen callId="call-blue-harbor-live" />);

    expect(await screen.findByText("Where things stand")).toBeInTheDocument();
    expect(screen.getByText("How long does integration take with SAP?")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Participants" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start call" })).toHaveAttribute(
      "href",
      "/live/call-blue-harbor-live",
    );
  });

  it("does not offer to start a call that has no script", async () => {
    renderAs("sam", <BriefScreen callId="call-solvex-qa" />);
    expect(await screen.findByText("Where things stand")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start call" })).not.toBeInTheDocument();
    expect(screen.getByText(/only scripted for the Blue Harbor call/)).toBeInTheDocument();
  });
});

describe("Live panel", () => {
  it("shows the newest card as the hero, earlier ones in history, and the next question", async () => {
    const user = userEvent.setup();
    renderAs("sam", <div />);
    configureApi({ baseUrl: "http://localhost/api", getUserId: () => "sam" });
    const events = await api.calls.scenario("call-blue-harbor-live");
    const state = events.reduce(liveReducer, initialLiveState);
    const onFeedback = vi.fn();

    render(<LivePanel state={state} elapsedSec={36} onFeedback={onFeedback} onAsked={vi.fn()} />);

    expect(screen.getByText("Listening")).toBeInTheDocument();
    expect(screen.getByText("Hidden from screen share")).toBeInTheDocument();
    const current = screen.getByRole("region", { name: "Current card" });
    expect(
      within(current).getByText("This differs from what was said earlier"),
    ).toBeInTheDocument();
    expect(screen.getByText("Which ERP version are you on today?")).toBeInTheDocument();

    const history = screen.getByRole("region", { name: "Earlier cards" });
    await user.click(within(history).getByRole("button", { name: /Answer/ }));
    await user.click(await within(history).findByRole("button", { name: "Useful" }));
    expect(onFeedback).toHaveBeenCalledWith("card-integration", "useful");

    expect(screen.getByRole("log", { name: "Transcript" })).toHaveTextContent("Thank you, Tom.");
  });
});

describe("Review summary", () => {
  it("lets the rep fix a line, approve, and then see what changed", async () => {
    const user = userEvent.setup();
    await endBlueHarbor();
    renderAs("sam", <ReviewScreen callId="call-blue-harbor-live" />);

    expect(await screen.findByRole("heading", { name: "Draft summary" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit next action" }));
    const input = screen.getByRole("textbox", { name: "Next action" });
    await user.clear(input);
    await user.type(input, "Send the plan and the security answer today{Enter}");
    expect(
      await screen.findByText("Send the plan and the security answer today"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve summary" }));
    const dialog = await screen.findByRole("dialog", { name: /Approve this summary/ });
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));

    expect(
      await screen.findByText(/3 tasks added, and the opportunity is updated/),
    ).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve summary" })).not.toBeInTheDocument();

    const tasks = await api.tasks.list({});
    expect(tasks.filter((t) => t.task.source === "call_summary")).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "View follow-up draft" }));
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("Facts used")).toBeInTheDocument();
  });

  it("says there is nothing to review before the call has happened", async () => {
    renderAs("sam", <ReviewScreen callId="call-blue-harbor-live" />);
    expect(await screen.findByText("No summary to review")).toBeInTheDocument();
  });
});

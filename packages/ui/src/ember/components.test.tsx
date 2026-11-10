import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnswerCard,
  ContradictionAlert,
  NextQuestion,
  NotConfirmedCard,
  SourceChip,
} from "./answers";
import { HeatIndicator } from "./attention";
import {
  CallTimer,
  ConsentStatus,
  formatDuration,
  ListeningIndicator,
  ShareStatus,
  TranscriptStream,
} from "./call";
import { DraftComposer, ExtractedField, StatusPill } from "./data";
import { EmptyState, ErrorState } from "./states";

const source = {
  title: "Integration guide",
  version: "v3",
  section: "section 2",
  passage: "Integration runs in three phases over six to eight weeks.",
};
const answer = "Integration runs in three phases over six to eight weeks, ERP connector first.";

afterEach(() => vi.useRealTimers());

describe("HeatIndicator", () => {
  it("names the state for screen readers even without a visible label", () => {
    render(<HeatIndicator heat="cooling" />);
    expect(screen.getByText("Cooling")).toHaveClass("sr-only");
  });

  it("shows the label when asked", () => {
    render(<HeatIndicator heat="warm" showLabel />);
    expect(screen.getByText("Warm")).not.toHaveClass("sr-only");
  });

  it("is reachable by keyboard when it has a tooltip", () => {
    render(<HeatIndicator heat="cold" showLabel lastActivity="9 days ago" />);
    expect(screen.getByText("Cold").parentElement).toHaveAttribute("tabindex", "0");
  });
});

describe("AnswerCard", () => {
  it("shows the whole answer at once when it is not streaming", () => {
    render(<AnswerCard answer={answer} source={source} />);
    expect(screen.getByRole("article", { name: "Answer" })).toHaveTextContent(answer);
  });

  it("streams word by word, and announces the finished answer once", () => {
    vi.useFakeTimers();
    render(<AnswerCard answer={answer} source={source} streaming />);
    const status = screen.getAllByRole("status")[0];
    expect(status).toHaveTextContent("");
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole("article")).not.toHaveTextContent(answer);
    act(() => vi.advanceTimersByTime(5000));
    expect(status).toHaveTextContent(answer);
  });

  it("keeps the action's name through the flow: Useful becomes Marked useful", async () => {
    const onFeedback = vi.fn();
    render(<AnswerCard answer={answer} source={source} onFeedback={onFeedback} />);
    await userEvent.click(screen.getByRole("button", { name: "Useful" }));
    expect(onFeedback).toHaveBeenCalledWith("useful");
    expect(screen.getByText("Marked useful")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wrong" })).not.toBeInTheDocument();
  });
});

describe("SourceChip", () => {
  it("opens the passage the answer rests on", async () => {
    render(<SourceChip source={source} />);
    await userEvent.click(screen.getByRole("button", { name: /Integration guide v3, section 2/ }));
    expect(await screen.findByText(source.passage)).toBeInTheDocument();
  });
});

describe("NotConfirmedCard", () => {
  it("quotes the holding line and says the question was added to follow-ups", () => {
    render(<NotConfirmedCard holdingLine="I want to confirm that with the team." />);
    expect(screen.getByText(/I want to confirm that with the team\./)).toHaveTextContent(/^“.*”$/);
    expect(screen.getByText("The question was added to your follow-ups.")).toBeInTheDocument();
  });
});

describe("ContradictionAlert and NextQuestion", () => {
  it("shows both statements", () => {
    render(<ContradictionAlert earlier="Go live in 4 weeks" now="Go live in 8 weeks" />);
    expect(screen.getByText("Go live in 4 weeks")).toBeInTheDocument();
    expect(screen.getByText("Go live in 8 weeks")).toBeInTheDocument();
  });

  it("marks a question as asked", async () => {
    render(<NextQuestion question="Which ERP are you on today?" />);
    await userEvent.click(screen.getByRole("button", { name: "Mark as asked" }));
    expect(screen.getByRole("button", { name: "Marked as asked" })).toBeDisabled();
  });
});

describe("call status", () => {
  it("formats the timer", () => {
    expect(formatDuration(724)).toBe("12:04");
    expect(formatDuration(-5)).toBe("00:00");
    render(<CallTimer seconds={724} />);
    expect(screen.getByText("12:04")).toBeInTheDocument();
  });

  it("states listening, share and consent in words", () => {
    render(
      <>
        <ListeningIndicator />
        <ShareStatus hidden />
        <ConsentStatus status="waiting" />
      </>,
    );
    expect(screen.getByText("Listening")).toBeInTheDocument();
    expect(screen.getByText("Hidden from screen share")).toBeInTheDocument();
    expect(screen.getByText("Waiting for recording consent")).toBeInTheDocument();
  });
});

describe("TranscriptStream", () => {
  const lines = [
    {
      id: "1",
      speaker: "client" as const,
      name: "Tom Reyes",
      text: "How long does integration take?",
    },
    { id: "2", speaker: "rep" as const, name: "Sam", text: "Let me check." },
  ];

  it("separates speakers and styles the client's lines as primary", () => {
    render(<TranscriptStream lines={lines} />);
    expect(screen.getByRole("log", { name: "Transcript" })).toBeInTheDocument();
    expect(screen.getByText(lines[0]!.text)).toHaveClass("text-coal");
    expect(screen.getByText(lines[1]!.text)).toHaveClass("text-smoke");
  });

  it("offers Jump to live after the user scrolls up", async () => {
    render(<TranscriptStream lines={lines} />);
    const log = screen.getByRole("log");
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(log, "clientHeight", { configurable: true, value: 200 });
    log.scrollTop = 100;
    fireEvent.scroll(log);
    await userEvent.click(await screen.findByRole("button", { name: "Jump to live" }));
    expect(screen.queryByRole("button", { name: "Jump to live" })).not.toBeInTheDocument();
  });
});

describe("ExtractedField", () => {
  it("saves with Enter and cancels with Escape", async () => {
    const onSave = vi.fn();
    render(<ExtractedField label="Next action" value="Send the ROI case study" onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit next action" }));
    const input = screen.getByLabelText("Next action");
    await userEvent.clear(input);
    await userEvent.type(input, "Book a demo{Enter}");
    expect(onSave).toHaveBeenCalledWith("Book a demo");
    expect(screen.getByText("Saved")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit next action" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByLabelText("Next action")).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe("DraftComposer", () => {
  it("turns Send into Sent and locks the draft", () => {
    const { rerender } = render(
      <DraftComposer body="Hi Tom" onBodyChange={() => {}} facts={["Timeline"]} />,
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    rerender(
      <DraftComposer body="Hi Tom" onBodyChange={() => {}} facts={["Timeline"]} status="sent" />,
    );
    expect(screen.getByRole("button", { name: "Sent" })).toBeDisabled();
    expect(screen.getByLabelText("Suggested reply")).toHaveAttribute("readonly");
  });

  it("lists the facts used", () => {
    render(
      <DraftComposer body="Hi" onBodyChange={() => {}} facts={["Timeline", "ROI case study"]} />,
    );
    expect(screen.getByText("ROI case study")).toBeInTheDocument();
  });
});

describe("states", () => {
  it("announces errors and offers a retry", async () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        title="Couldn't load your list"
        description="Check your connection and try again."
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your list");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("invites action when empty", () => {
    render(
      <EmptyState
        title="Nothing needs you right now"
        description="New items appear after tomorrow's 7:00 check."
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Nothing needs you right now" }),
    ).toBeInTheDocument();
  });

  it("uses overdue styling only for the overdue tone", () => {
    render(
      <>
        <StatusPill tone="overdue">6 days over</StatusPill>
        <StatusPill tone="done">Handled</StatusPill>
      </>,
    );
    expect(screen.getByText("6 days over")).toHaveClass("text-flare");
    expect(screen.getByText("Handled")).not.toHaveClass("text-flare");
  });
});

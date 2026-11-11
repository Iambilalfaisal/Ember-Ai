// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { configureApi } from "../client";
import {
  useApproveSummary,
  useDeal,
  useDrafts,
  useEndCall,
  useMyDay,
  useSendDraft,
  useTasks,
  useTeam,
  useUpdateDeal,
} from "./index";

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

describe("hooks over the mock backend", () => {
  it("returns the seeded My Day", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useMyDay(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.counts.needYou).toBe(4);
  });

  it("approving a summary updates My Day, Tasks and the deal in other hooks", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        myDay: useMyDay(),
        tasks: useTasks({ status: "open" }),
        deal: useDeal("blue-harbor"),
        end: useEndCall(),
        approve: useApproveSummary(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.deal.data).toBeDefined());
    const tasksBefore = result.current.tasks.data?.length ?? 0;
    expect(result.current.myDay.data?.items.map((i) => i.deal.id)).toContain("blue-harbor");

    await act(async () => {
      await result.current.end.mutateAsync({ id: "call-blue-harbor-live" });
    });
    await act(async () => {
      await result.current.approve.mutateAsync("call-blue-harbor-live");
    });

    await waitFor(() =>
      expect(result.current.myDay.data?.items.map((i) => i.deal.id)).not.toContain("blue-harbor"),
    );
    await waitFor(() => expect(result.current.tasks.data?.length).toBeGreaterThan(tasksBefore));
    await waitFor(() => expect(result.current.deal.data?.interactions[0]?.type).toBe("call"));
  });

  it("sending a draft lowers the My Day count", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({ myDay: useMyDay(), drafts: useDrafts("meridian"), send: useSendDraft() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.drafts.data).toBeDefined());
    await waitFor(() => expect(result.current.myDay.data).toBeDefined());
    const draft = result.current.drafts.data![0]!;
    await act(async () => {
      await result.current.send.mutateAsync(draft.id);
    });
    await waitFor(() => expect(result.current.myDay.data?.counts.needYou).toBe(3));
  });

  it("assigning Nimbus to Jules shows up in Jules's My Day and in Team view", async () => {
    configureApi({ getUserId: () => "priya" });
    const { wrapper } = setup();
    const lead = renderHook(() => ({ team: useTeam(), update: useUpdateDeal() }), { wrapper });
    await waitFor(() => expect(lead.result.current.team.data).toBeDefined());
    await act(async () => {
      await lead.result.current.update.mutateAsync({ id: "nimbus", body: { ownerId: "jules" } });
    });
    await waitFor(() =>
      expect(
        lead.result.current.team.data?.rows.find((r) => r.deal.id === "nimbus")?.deal.status,
      ).toBe("needs_attention"),
    );

    configureApi({ getUserId: () => "jules" });
    const jules = renderHook(() => useMyDay(), { wrapper: setup().wrapper });
    await waitFor(() => expect(jules.result.current.data).toBeDefined());
    expect(jules.result.current.data?.items.map((i) => i.deal.id)).toEqual(["nimbus"]);
  });
});

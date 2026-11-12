import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type {
  EndCallBody,
  UpdateDealBody,
  UpdateDraftBody,
  UpdateNotesBody,
  UpdateSettingsBody,
  UpdateSummaryBody,
} from "../domain";
import { keys } from "./keys";

export { keys };

// Reads -----------------------------------------------------------------------------------------

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: api.session.me });
export const useUsers = () => useQuery({ queryKey: keys.users, queryFn: api.session.users });
export const useMyDay = () => useQuery({ queryKey: keys.myDay, queryFn: api.myDay.get });

export const useDeals = (filters: Parameters<typeof api.deals.list>[0] = {}) =>
  useQuery({ queryKey: keys.deals(filters), queryFn: () => api.deals.list(filters) });
export const useDeal = (id: string) =>
  useQuery({ queryKey: keys.deal(id), queryFn: () => api.deals.get(id) });
export const useNotes = (dealId: string) =>
  useQuery({ queryKey: keys.notes(dealId), queryFn: () => api.deals.notes(dealId) });
export const useDrafts = (dealId: string) =>
  useQuery({ queryKey: keys.drafts(dealId), queryFn: () => api.deals.drafts(dealId) });

export const useContacts = (filters: Parameters<typeof api.contacts.list>[0] = {}) =>
  useQuery({ queryKey: keys.contacts(filters), queryFn: () => api.contacts.list(filters) });
export const useTasks = (filters: Parameters<typeof api.tasks.list>[0] = {}) =>
  useQuery({ queryKey: keys.tasks(filters), queryFn: () => api.tasks.list(filters) });

export const useTeam = (filters: Parameters<typeof api.team.get>[0] = {}) =>
  useQuery({ queryKey: keys.team(filters), queryFn: () => api.team.get(filters) });
export const useRevival = () => useQuery({ queryKey: keys.revival, queryFn: api.team.revival });

export const useCalls = (filters: Parameters<typeof api.calls.list>[0] = {}) =>
  useQuery({ queryKey: keys.calls(filters), queryFn: () => api.calls.list(filters) });
export const useCall = (id: string) =>
  useQuery({ queryKey: keys.call(id), queryFn: () => api.calls.get(id) });
export const useBrief = (id: string) =>
  useQuery({ queryKey: keys.brief(id), queryFn: () => api.calls.brief(id) });
export const useScenario = (id: string) =>
  useQuery({ queryKey: keys.scenario(id), queryFn: () => api.calls.scenario(id), retry: false });
export const useSummary = (id: string) =>
  useQuery({ queryKey: keys.summary(id), queryFn: () => api.calls.summary(id) });

export const useDocuments = () =>
  useQuery({ queryKey: keys.documents, queryFn: api.knowledge.documents });
export const useScorecard = () =>
  useQuery({ queryKey: keys.scorecard, queryFn: api.knowledge.scorecard });
export const usePilotReport = () => useQuery({ queryKey: keys.pilot, queryFn: api.reports.pilot });
export const useNotifications = () =>
  useQuery({ queryKey: keys.notifications, queryFn: api.notifications.list });
export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: api.settings.get });

// Writes ----------------------------------------------------------------------------------------
// One action changes several screens (approving a summary adds tasks, clears My Day and moves the
// deal). So every successful write refreshes all loaded data. The data set is small and this is
// the one rule that cannot leave a screen stale.

function refreshAll(client: QueryClient) {
  return client.invalidateQueries();
}

function useWrite<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => refreshAll(client) });
}

export const useHandleMyDayItem = () => useWrite((id: string) => api.myDay.handle(id));
export const useSnoozeMyDayItem = () =>
  useWrite((v: { id: string; days: number }) => api.myDay.snooze(v.id, v.days));

export const useUpdateDeal = () =>
  useWrite((v: { id: string; body: UpdateDealBody }) => api.deals.update(v.id, v.body));
export const useUpdateNotes = () =>
  useWrite((v: { dealId: string; body: UpdateNotesBody }) =>
    api.deals.updateNotes(v.dealId, v.body),
  );

export const useUpdateDraft = () =>
  useWrite((v: { id: string; body: UpdateDraftBody }) => api.drafts.update(v.id, v.body));
export const useRegenerateDraft = () => useWrite((id: string) => api.drafts.regenerate(id));
export const useSendDraft = () => useWrite((id: string) => api.drafts.send(id));

export const useUpdateTask = () =>
  useWrite((v: { id: string; status: "open" | "done" }) => api.tasks.update(v.id, v.status));

export const useEndCall = () =>
  useWrite((v: { id: string; body?: EndCallBody }) => api.calls.end(v.id, v.body));
export const useUpdateSummary = () =>
  useWrite((v: { id: string; body: UpdateSummaryBody }) => api.calls.updateSummary(v.id, v.body));
export const useApproveSummary = () => useWrite((id: string) => api.calls.approveSummary(id));
export const useCardFeedback = () =>
  useWrite((v: { callId: string; cardId: string; verdict: "useful" | "wrong" }) =>
    api.calls.cardFeedback(v.callId, v.cardId, v.verdict),
  );

export const useAskKnowledge = () => useMutation({ mutationFn: api.knowledge.ask });
export const useUploadDocument = () => useWrite(api.knowledge.upload);
export const useReplaceDocument = () =>
  useWrite((v: { id: string; title?: string }) =>
    api.knowledge.replace(v.id, v.title ? { title: v.title } : {}),
  );
export const useDeactivateDocument = () => useWrite((id: string) => api.knowledge.deactivate(id));
export const useActivateDocument = () => useWrite((id: string) => api.knowledge.activate(id));

export const useUpdateSettings = () =>
  useWrite((body: UpdateSettingsBody) => api.settings.update(body));
export const useMarkNotificationsRead = () => useWrite(() => api.notifications.markAllRead());
export const useResetDemo = () => useWrite(() => api.session.reset());

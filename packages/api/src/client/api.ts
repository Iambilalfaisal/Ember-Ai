import { z } from "zod";
import {
  ActionResult,
  ApproveSummaryResult,
  AuditEntry,
  Call,
  CallBrief,
  CallCard,
  CallDetail,
  CallSummary,
  ContactRow,
  Contact,
  Deal,
  DealDetail,
  ImportResult,
  DiscoveryNotes,
  Digest,
  Draft,
  KnowledgeAnswer,
  LogCallResult,
  NotificationPrefs,
  Suggestion,
  LiveEvent,
  KnowledgeDocument,
  MyDay,
  NotificationList,
  PickLists,
  PilotReport,
  RevivalQueue,
  Scorecard,
  Settings,
  Task,
  TaskRow,
  TeamView,
  User,
  type CreateDealBody,
  type LogCallBody,
  type EndCallBody,
  type ImportDealsBody,
  type UpdateContactBody,
  type UpdateDealBody,
  type UpdateDraftBody,
  type UpdateNotesBody,
  type UpdateSettingsBody,
  type UpdateSummaryBody,
} from "../domain";
import { request } from "./http";

// One function per endpoint. Hooks call these; mock mode and live mode use the same calls.

const ok = z.object({ ok: z.literal(true) });

export const api = {
  session: {
    me: () => request("/me", { schema: User }),
    users: () => request("/users", { schema: z.array(User) }),
    reset: () => request("/demo/reset", { method: "POST", schema: ok }),
  },
  myDay: {
    get: () => request("/my-day", { schema: MyDay }),
    handle: (id: string) =>
      request(`/my-day/${id}/handle`, { method: "POST", schema: ActionResult }),
    snooze: (id: string, days: number) =>
      request(`/my-day/${id}/snooze`, { method: "POST", body: { days }, schema: ActionResult }),
  },
  deals: {
    list: (filters: { stage?: string; ownerId?: string; status?: string; q?: string } = {}) =>
      request("/deals", { query: filters, schema: z.array(Deal) }),
    get: (id: string) => request(`/deals/${id}`, { schema: DealDetail }),
    update: (id: string, body: UpdateDealBody) =>
      request(`/deals/${id}`, { method: "PATCH", body, schema: Deal }),
    create: (body: CreateDealBody) => request("/deals", { method: "POST", body, schema: Deal }),
    import: (body: ImportDealsBody) =>
      request("/deals/import", { method: "POST", body, schema: ImportResult }),
    notes: (id: string) => request(`/deals/${id}/notes`, { schema: DiscoveryNotes }),
    updateNotes: (id: string, body: UpdateNotesBody) =>
      request(`/deals/${id}/notes`, { method: "PATCH", body, schema: DiscoveryNotes }),
    drafts: (id: string) => request(`/deals/${id}/drafts`, { schema: z.array(Draft) }),
  },
  drafts: {
    update: (id: string, body: UpdateDraftBody) =>
      request(`/drafts/${id}`, { method: "PATCH", body, schema: Draft }),
    regenerate: (id: string) =>
      request(`/drafts/${id}/regenerate`, { method: "POST", schema: Draft }),
    send: (id: string) => request(`/drafts/${id}/send`, { method: "POST", schema: Draft }),
  },
  contacts: {
    update: (id: string, body: UpdateContactBody) =>
      request(`/contacts/${id}`, { method: "PATCH", body, schema: Contact }),
    list: (filters: { q?: string } = {}) =>
      request("/contacts", { query: filters, schema: z.array(ContactRow) }),
  },
  tasks: {
    list: (filters: { status?: "open" | "done" } = {}) =>
      request("/tasks", { query: filters, schema: z.array(TaskRow) }),
    update: (id: string, status: "open" | "done") =>
      request(`/tasks/${id}`, { method: "PATCH", body: { status }, schema: Task }),
  },
  team: {
    get: (filters: { ownerId?: string; status?: string; q?: string } = {}) =>
      request("/team", { query: filters, schema: TeamView }),
    revival: () => request("/revival", { schema: RevivalQueue }),
  },
  calls: {
    list: (
      filters: {
        q?: string;
        repId?: string;
        dealId?: string;
        status?: string;
        outcome?: string;
      } = {},
    ) => request("/calls", { query: filters, schema: z.array(Call) }),
    get: (id: string) => request(`/calls/${id}`, { schema: CallDetail }),
    brief: (id: string) => request(`/calls/${id}/brief`, { schema: CallBrief }),
    end: (id: string, body: EndCallBody = {}) =>
      request(`/calls/${id}/end`, { method: "POST", body, schema: CallSummary }),
    scenario: (id: string) => request(`/calls/${id}/scenario`, { schema: z.array(LiveEvent) }),
    summary: (id: string) => request(`/calls/${id}/summary`, { schema: CallSummary }),
    updateSummary: (id: string, body: UpdateSummaryBody) =>
      request(`/calls/${id}/summary`, { method: "PATCH", body, schema: CallSummary }),
    approveSummary: (id: string) =>
      request(`/calls/${id}/summary/approve`, { method: "POST", schema: ApproveSummaryResult }),
    cardFeedback: (callId: string, cardId: string, verdict: "useful" | "wrong") =>
      request(`/calls/${callId}/cards/${cardId}/feedback`, {
        method: "POST",
        body: { verdict },
        schema: CallCard,
      }),
  },
  knowledge: {
    documents: () => request("/knowledge/documents", { schema: z.array(KnowledgeDocument) }),
    upload: (body: { title: string; docType: KnowledgeDocument["docType"] }) =>
      request("/knowledge/documents", { method: "POST", body, schema: KnowledgeDocument }),
    replace: (id: string, body: { title?: string } = {}) =>
      request(`/knowledge/documents/${id}/replace`, {
        method: "POST",
        body,
        schema: KnowledgeDocument,
      }),
    deactivate: (id: string) =>
      request(`/knowledge/documents/${id}/deactivate`, {
        method: "POST",
        schema: KnowledgeDocument,
      }),
    activate: (id: string) =>
      request(`/knowledge/documents/${id}/activate`, { method: "POST", schema: KnowledgeDocument }),
    ask: (question: string) =>
      request("/knowledge/ask", { method: "POST", body: { question }, schema: KnowledgeAnswer }),
    scorecard: () => request("/knowledge/scorecard", { schema: Scorecard }),
  },
  notifications: {
    list: () => request("/notifications", { schema: NotificationList }),
    markAllRead: () => request("/notifications/read", { method: "POST", schema: ok }),
  },
  reports: {
    pilot: () => request("/reports/pilot", { schema: PilotReport }),
  },
  copilot: {
    digest: () => request("/copilot/digest", { schema: Digest }),
    suggestions: () => request("/copilot/suggestions", { schema: z.array(Suggestion) }),
    approve: (id: string) =>
      request(`/copilot/suggestions/${id}/approve`, { method: "POST", schema: Suggestion }),
    dismiss: (id: string) =>
      request(`/copilot/suggestions/${id}/dismiss`, { method: "POST", schema: Suggestion }),
    audit: (filters: { limit?: number; dealId?: string } = {}) =>
      request("/audit", { query: filters, schema: z.array(AuditEntry) }),
    logCall: (dealId: string, body: LogCallBody) =>
      request(`/deals/${dealId}/log-call`, { method: "POST", body, schema: LogCallResult }),
    preferences: () => request("/me/preferences", { schema: NotificationPrefs }),
    updatePreferences: (body: Partial<NotificationPrefs>) =>
      request("/me/preferences", { method: "PATCH", body, schema: NotificationPrefs }),
  },
  settings: {
    get: () => request("/settings", { schema: Settings }),
    lists: () => request("/settings/lists", { schema: PickLists }),
    update: (body: UpdateSettingsBody) =>
      request("/settings", { method: "PATCH", body, schema: Settings }),
  },
};

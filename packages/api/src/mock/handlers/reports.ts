import { PilotReport, Settings, UpdateSettingsBody } from "../../domain";
import { db } from "../db";
import { json, toSettings } from "../mappers";
import { notFound, route } from "./shared";

export const reportHandlers = [
  route("get", "/reports/pilot", {
    roles: ["lead", "admin"],
    run: () => {
      const names = new Map(db.user.getAll().map((u) => [u.id, u.name]));
      const weeks = db.weekly
        .getAll()
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
        .map((w) => ({
          weekStart: w.weekStart,
          answersUsed: w.answersUsed,
          answersCorrect: w.answersCorrect,
          techQuestionsHandled: w.techQuestionsHandled,
          followUpMinutes: w.followUpMinutes,
          dealsToProposal: w.dealsToProposal,
          overdueByRep: db.overdue
            .findMany({ where: { weekStart: { equals: w.weekStart } } })
            .map((o) => ({
              repId: o.repId,
              repName: names.get(o.repId) ?? o.repId,
              overdue: o.overdue,
            })),
        }));
      return PilotReport.parse({ weeks });
    },
  }),

  route("get", "/settings", {
    roles: ["lead", "admin"],
    run: () =>
      Settings.parse(
        toSettings(
          db.settings.findFirst({ where: { id: { equals: "settings" } } }) ??
            notFound("The settings"),
        ),
      ),
  }),

  route("patch", "/settings", {
    roles: ["admin"],
    body: UpdateSettingsBody,
    run: ({ body }) => {
      const row =
        db.settings.findFirst({ where: { id: { equals: "settings" } } }) ??
        notFound("The settings");
      const current = toSettings(row);
      const next = Settings.parse({
        ...current,
        ...(body.followUpDays && {
          followUpDays: { ...current.followUpDays, ...body.followUpDays },
        }),
        ...(body.recordingConsent && { recordingConsent: body.recordingConsent }),
        ...(body.retentionDays !== undefined && { retentionDays: body.retentionDays }),
      });
      db.settings.update({ where: { id: { equals: "settings" } }, data: { json: json(next) } });
      return next;
    },
  }),
];

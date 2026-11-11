import { faker } from "@faker-js/faker";
import { startOfWeek, subWeeks } from "date-fns";
import { db } from "../db";
import { json } from "../mappers";
import { iso, type SeedContext } from "./people";

/** Six weeks of pilot metrics, improving week on week, from a fixed seed. */
export function seedReports(ctx: SeedContext): void {
  faker.seed(77);
  for (let i = 5; i >= 0; i--) {
    const weekStart = iso(startOfWeek(subWeeks(ctx.now, i), { weekStartsOn: 1 }));
    const step = 5 - i;
    const used = 22 + step * 9 + faker.number.int({ min: 0, max: 5 });
    db.weekly.create({
      weekStart,
      answersUsed: used,
      answersCorrect: Math.round(used * (0.84 + step * 0.015)),
      techQuestionsHandled: 10 + step * 4 + faker.number.int({ min: 0, max: 3 }),
      followUpMinutes: Math.round(190 - step * 26 + faker.number.int({ min: -8, max: 8 })),
      dealsToProposal: Math.min(1 + Math.floor(step / 2) + faker.number.int({ min: 0, max: 1 }), 6),
    });
    for (const rep of ["sam", "jules"]) {
      db.overdue.create({
        id: `${weekStart}-${rep}`,
        weekStart,
        repId: rep,
        overdue:
          Math.max(
            0,
            (rep === "sam" ? 9 : 5) -
              step * (rep === "sam" ? 1 : 0.8) +
              faker.number.int({ min: -1, max: 1 }),
          ) | 0,
      });
    }
  }

  db.settings.create({
    id: "settings",
    json: json({
      followUpDays: { discovery: 5, qualified: 5, proposal: 7, negotiation: 3, won: 30, lost: 90 },
      recordingConsent: "announce",
      retentionDays: 90,
      integrations: [
        { id: "teams", name: "Microsoft Teams", status: "connected" },
        { id: "outlook", name: "Outlook", status: "connected" },
        { id: "clickup", name: "ClickUp", status: "not_connected" },
      ],
      aiUsage: { month: "This month", answers: 312, costUsd: 41.8 },
    }),
  });
}

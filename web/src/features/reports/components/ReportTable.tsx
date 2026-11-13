import type { PilotReport } from "@ember/api";
import { shortDate } from "@/lib/format";

export function ReportTable({ weeks }: { weeks: PilotReport["weeks"] }) {
  const reps = weeks[0]?.overdueByRep ?? [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Pilot metrics by week</caption>
        <thead>
          <tr className="border-b border-cinder text-detail text-smoke">
            <th scope="col" className="py-2 pr-4 font-medium">
              Week of
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Answers used
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Answers correct
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Technical questions handled
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Follow-up time, minutes
            </th>
            {reps.map((rep) => (
              <th key={rep.repId} scope="col" className="py-2 pr-4 text-right font-medium">
                Overdue, {rep.repName}
              </th>
            ))}
            <th scope="col" className="py-2 text-right font-medium">
              Moved to proposal
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cinder">
          {weeks.map((week) => (
            <tr key={week.weekStart}>
              <th scope="row" className="h-12 pr-4 font-normal text-coal">
                {shortDate(week.weekStart)}
              </th>
              <td className="pr-4 text-right text-coal">{week.answersUsed}</td>
              <td className="pr-4 text-right text-coal">{week.answersCorrect}</td>
              <td className="pr-4 text-right text-coal">{week.techQuestionsHandled}</td>
              <td className="pr-4 text-right text-coal">{week.followUpMinutes}</td>
              {week.overdueByRep.map((rep) => (
                <td key={rep.repId} className="pr-4 text-right text-coal">
                  {rep.overdue}
                </td>
              ))}
              <td className="text-right text-coal">{week.dealsToProposal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

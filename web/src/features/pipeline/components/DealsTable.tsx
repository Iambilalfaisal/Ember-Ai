import type { Deal, User } from "@ember/api";
import { HeatIndicator, StageBadge } from "@ember/ui";
import Link from "next/link";
import { money, shortDate } from "@/lib/format";
import { STAGE_LABEL } from "@/lib/stages";

export function DealsTable({ deals, owners }: { deals: Deal[]; owners: Map<string, User> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
        <caption className="sr-only">Opportunities</caption>
        <thead>
          <tr className="border-b border-cinder text-detail text-smoke">
            <th scope="col" className="py-2 pr-4 font-medium">
              Opportunity
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Stage
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Value
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Owner
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Heat
            </th>
            <th scope="col" className="py-2 font-medium">
              Last activity
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cinder">
          {deals.map((deal) => (
            <tr key={deal.id} className="align-top">
              <td className="py-3 pr-4">
                <Link
                  href={`/deals/${deal.id}`}
                  className="font-medium text-coal underline-offset-2 hover:underline"
                >
                  {deal.company}
                </Link>
              </td>
              <td className="py-3 pr-4">
                <StageBadge stage={STAGE_LABEL[deal.stage]} />
              </td>
              <td className="py-3 pr-4 text-right text-coal">{money(deal.value)}</td>
              <td className="py-3 pr-4 text-coal">
                {deal.ownerId ? (owners.get(deal.ownerId)?.name ?? deal.ownerId) : "Unassigned"}
              </td>
              <td className="py-3 pr-4">
                <HeatIndicator heat={deal.heat} showLabel />
              </td>
              <td className="py-3">
                <p className="text-coal">{deal.lastActivityNote}</p>
                <p className="text-detail text-smoke">{shortDate(deal.lastActivityAt)}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

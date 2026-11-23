"use client";

import {
  contactRoles,
  useDeal,
  useMe,
  useUpdateContact,
  useUpdateDeal,
  type ContactRole,
  type Stage,
  type UpdateDealBody,
} from "@ember/api";
import {
  Button,
  ErrorState,
  ExtractedField,
  HeatIndicator,
  Skeleton,
  buttonVariants,
  cn,
} from "@ember/ui";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { CloseReasonDialog } from "@/components/CloseReasonDialog";
import { CONTACT_ROLE_LABEL } from "@/lib/contactRoles";
import { LogCallDialog } from "@/features/copilot";
import { TaskList } from "@/features/tasks";
import { dateTime, money } from "@/lib/format";
import { STAGE_LABEL, STAGES } from "@/lib/stages";
import { useUserMap } from "@/lib/useUserMap";
import { Timeline } from "../components/Timeline";

const selectClass =
  "h-9 rounded-control border border-smoke bg-paper px-2 text-sm text-coal transition-instant hover:border-iris focus-visible:border-iris";

export function DealDetailScreen({ dealId }: { dealId: string }) {
  const { data, isPending, isError, refetch } = useDeal(dealId);
  const { data: me } = useMe();
  const { users } = useUserMap();
  const update = useUpdateDeal();
  const updateContact = useUpdateContact();
  const [closing, setClosing] = useState<"won" | "lost" | null>(null);
  const [logging, setLogging] = useState(false);

  if (isPending) {
    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-busy="true">
        <div className="space-y-3">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="Couldn't open this opportunity"
        description="It may not exist, or it may belong to someone else. Go back to the pipeline and try again."
        onRetry={() => void refetch()}
      />
    );
  }

  const { deal, owner, contacts, interactions, tasks, latestSummary, upcomingCall } = data;
  const save = (body: UpdateDealBody, done: string) =>
    update.mutate(
      { id: deal.id, body },
      {
        onSuccess: () => toast(done),
        onError: () => toast.error("Couldn't save that change. Try again."),
      },
    );
  const canAssign = me !== undefined && me.role !== "rep";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
        <header className="space-y-3" data-tour="deal-header">
          <div>
            <h2 className="text-xl font-semibold text-coal">{deal.company}</h2>
            <p className="text-sm text-smoke">{money(deal.value)} a year</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 text-detail text-smoke">
              Stage
              <select
                value={deal.stage}
                onChange={(event) => {
                  const stage = event.target.value as Stage;
                  if (stage === "won" || stage === "lost") setClosing(stage);
                  else save({ stage }, `${deal.company} moved to ${STAGE_LABEL[stage]}.`);
                }}
                className={selectClass}
              >
                {STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_LABEL[stage]}
                  </option>
                ))}
              </select>
            </label>
            {canAssign ? (
              <label className="flex items-center gap-2 text-detail text-smoke">
                Owner
                <select
                  value={deal.ownerId ?? "none"}
                  onChange={(event) =>
                    save(
                      { ownerId: event.target.value === "none" ? null : event.target.value },
                      "Owner changed.",
                    )
                  }
                  className={selectClass}
                >
                  {deal.ownerId ? null : <option value="none">Unassigned</option>}
                  {users
                    .filter((user) => user.role === "rep")
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <p className="text-detail text-smoke">
                Owner <span className="text-coal">{owner?.name ?? "Unassigned"}</span>
              </p>
            )}
            <HeatIndicator heat={deal.heat} showLabel lastActivity={deal.lastActivityNote} />
            <Button
              size="sm"
              variant="secondary"
              disabled={contacts.every((c) => c.status === "opted_out")}
              onClick={() => setLogging(true)}
            >
              Log a call
            </Button>
          </div>
        </header>

        {logging ? (
          <LogCallDialog
            dealId={deal.id}
            company={deal.company}
            onClose={() => setLogging(false)}
          />
        ) : null}

        {closing ? (
          <CloseReasonDialog
            company={deal.company}
            stage={closing}
            busy={update.isPending}
            onCancel={() => setClosing(null)}
            onConfirm={(closeReason) => {
              save({ stage: closing, closeReason }, `${deal.company} closed as ${closing}.`);
              setClosing(null);
            }}
          />
        ) : null}

        {deal.closeReason ? (
          <p className="text-sm text-smoke">
            Closed: <span className="text-coal">{deal.closeReason}</span>
          </p>
        ) : null}

        <section
          aria-label="Where it stands"
          className="divide-y divide-cinder overflow-hidden rounded-panel border border-cinder bg-paper shadow-card"
        >
          <ExtractedField
            label="Next action"
            value={deal.nextAction ?? "None set"}
            onSave={(value) => save({ nextAction: value.trim() || null }, "Next action saved.")}
            className="px-4 py-2"
          />
          <ExtractedField
            label="Blocker"
            value={deal.blocker ?? "None"}
            onSave={(value) => save({ blocker: value.trim() || null }, "Blocker saved.")}
            className="px-4 py-2"
          />
        </section>

        <section aria-labelledby="latest-summary">
          <h3 id="latest-summary" className="text-sm font-medium text-coal">
            Latest call summary
          </h3>
          <p className="mt-1 max-w-[72ch] text-sm text-coal">
            {latestSummary ?? "No call has been summarised yet."}
          </p>
        </section>

        <section aria-labelledby="activity">
          <h3 id="activity" className="mb-1 text-sm font-medium text-coal">
            Activity
          </h3>
          {interactions.length === 0 ? (
            <p className="text-sm text-smoke">
              Calls, emails and stage changes appear here as they happen.
            </p>
          ) : (
            <Timeline interactions={interactions} />
          )}
        </section>
      </div>

      <aside className="min-w-0 space-y-6 self-start rounded-panel border border-cinder bg-paper p-5 shadow-card">
        <section aria-labelledby="upcoming-call">
          <h3 id="upcoming-call" className="text-sm font-medium text-coal">
            Upcoming call
          </h3>
          {upcomingCall ? (
            <div className="mt-1 space-y-2">
              <p className="text-sm text-coal">{upcomingCall.title}</p>
              <p className="text-detail text-smoke">{dateTime(upcomingCall.startsAt)}</p>
              <Link
                href={`/calls/${upcomingCall.id}/prep`}
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
              >
                Open brief
              </Link>
            </div>
          ) : (
            <p className="mt-1 text-sm text-smoke">No call is booked.</p>
          )}
        </section>

        <section aria-labelledby="contacts">
          <h3 id="contacts" className="text-sm font-medium text-coal">
            Contacts
          </h3>
          <ul className="mt-1 divide-y divide-cinder overflow-hidden rounded-panel border border-cinder bg-paper shadow-card">
            {contacts.map((contact) => (
              <li key={contact.id} className="space-y-1 px-4 py-2">
                <p className="text-sm font-medium text-coal">
                  {contact.name}
                  {contact.status === "opted_out" ? (
                    <span className="ml-2 rounded-control border border-flare px-1.5 py-0.5 text-detail font-normal text-flare">
                      Opted out
                    </span>
                  ) : null}
                </p>
                <p className="text-detail text-smoke">{contact.title}</p>
                <a
                  href={`mailto:${contact.email}`}
                  className="break-all text-detail text-coal underline-offset-2 hover:underline"
                >
                  {contact.email}
                </a>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <select
                    aria-label={`Role of ${contact.name}`}
                    value={contact.role}
                    onChange={(event) =>
                      updateContact.mutate(
                        { id: contact.id, body: { role: event.target.value as ContactRole } },
                        { onError: () => toast.error("Couldn't change the role. Try again.") },
                      )
                    }
                    className={selectClass}
                  >
                    {contactRoles.map((role) => (
                      <option key={role} value={role}>
                        {CONTACT_ROLE_LABEL[role]}
                      </option>
                    ))}
                  </select>
                  {contact.status === "active" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={updateContact.isPending}
                      onClick={() =>
                        updateContact.mutate(
                          { id: contact.id, body: { status: "opted_out" } },
                          {
                            onSuccess: () =>
                              toast(`${contact.name} opted out. Ember will not contact them.`),
                            onError: () => toast.error("Couldn't save that. Try again."),
                          },
                        )
                      }
                    >
                      Mark opted out
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={updateContact.isPending}
                      onClick={() =>
                        updateContact.mutate(
                          { id: contact.id, body: { status: "active" } },
                          { onError: () => toast.error("Couldn't save that. Try again.") },
                        )
                      }
                    >
                      Allow contact again
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="deal-tasks">
          <h3 id="deal-tasks" className="mb-1 text-sm font-medium text-coal">
            Tasks
          </h3>
          {tasks.length === 0 ? (
            <p className="text-sm text-smoke">
              No tasks yet. They are added when you approve a call summary.
            </p>
          ) : (
            <TaskList
              label="Tasks for this opportunity"
              showCompany={false}
              rows={tasks.map((task) => ({ task, company: deal.company }))}
            />
          )}
        </section>
      </aside>
    </div>
  );
}

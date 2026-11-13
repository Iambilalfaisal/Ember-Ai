"use client";

import {
  useMe,
  useSettings,
  useUpdateSettings,
  useUsers,
  type Settings,
  type Stage,
} from "@ember/api";
import { Button, EmptyState, ErrorState, Input, Skeleton, StatusPill } from "@ember/ui";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { plural } from "@/lib/format";
import { STAGES, STAGE_LABEL } from "@/lib/stages";

const selectClass =
  "h-9 rounded-control border border-smoke bg-paper px-2 text-sm text-coal transition-instant hover:border-coal disabled:opacity-50";

const CONSENT: { value: Settings["recordingConsent"]; label: string; description: string }[] = [
  {
    value: "required",
    label: "Required",
    description: "Ember only listens once every participant has agreed.",
  },
  {
    value: "announce",
    label: "Announce",
    description: "Ember tells participants the call is being transcribed, then listens.",
  },
  { value: "off", label: "Off", description: "Ember does not listen to calls." },
];

const RETENTION = [30, 60, 90, 180, 365];

/** Loads settings once and hands them to a section, with shared loading and error states. */
export function SettingsData({
  children,
}: {
  children: (settings: Settings, canEdit: boolean) => ReactNode;
}) {
  const { data, isPending, isError, refetch } = useSettings();
  const { data: me } = useMe();
  if (isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full max-w-xl" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="Couldn't load settings"
        description="Check your connection and try again."
        onRetry={() => void refetch()}
      />
    );
  }
  return <>{children(data, me?.role === "admin")}</>;
}

function ReadOnlyNote({ canEdit }: { canEdit: boolean }) {
  return canEdit ? null : (
    <p className="text-detail text-smoke">Only an admin can change these settings.</p>
  );
}

export function FollowUpRules({ settings, canEdit }: { settings: Settings; canEdit: boolean }) {
  const update = useUpdateSettings();
  const [days, setDays] = useState<Record<Stage, string>>(
    () =>
      Object.fromEntries(STAGES.map((s) => [s, String(settings.followUpDays[s] ?? "")])) as Record<
        Stage,
        string
      >,
  );
  const valid = (value: string) =>
    /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 365;
  const allValid = STAGES.every((s) => valid(days[s]));
  const changed = STAGES.some((s) => Number(days[s]) !== settings.followUpDays[s]);

  const save = async () => {
    try {
      await update.mutateAsync({
        followUpDays: Object.fromEntries(STAGES.map((s) => [s, Number(days[s])])),
      });
      toast.success("Follow-up rules saved.");
    } catch {
      toast.error("Couldn't save the rules. Try again.");
    }
  };

  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (allValid && changed) void save();
      }}
    >
      <p className="text-sm text-smoke">
        An opportunity needs attention when it has had no call, email or note for this many days.
      </p>
      <ul className="divide-y divide-cinder border-y border-cinder">
        {STAGES.map((stage) => (
          <li key={stage} className="flex h-14 items-center justify-between gap-4">
            <label htmlFor={`days-${stage}`} className="text-sm text-coal">
              {STAGE_LABEL[stage]}
            </label>
            <span className="flex items-center gap-2 text-sm text-smoke">
              <Input
                id={`days-${stage}`}
                inputMode="numeric"
                value={days[stage]}
                disabled={!canEdit}
                aria-invalid={!valid(days[stage])}
                onChange={(event) => setDays((d) => ({ ...d, [stage]: event.target.value }))}
                className="w-20 text-right text-coal"
              />
              days
            </span>
          </li>
        ))}
      </ul>
      {!allValid ? (
        <p
          role="alert"
          className="rounded-control border border-flare bg-paper px-3 py-2 text-detail text-flare"
        >
          Enter a whole number of days from 1 to 365 for every stage.
        </p>
      ) : null}
      {canEdit ? (
        <Button
          type="submit"
          variant="primary"
          disabled={!allValid || !changed || update.isPending}
        >
          Save changes
        </Button>
      ) : null}
      <ReadOnlyNote canEdit={canEdit} />
    </form>
  );
}

export function ConsentAndRetention({
  settings,
  canEdit,
}: {
  settings: Settings;
  canEdit: boolean;
}) {
  const update = useUpdateSettings();
  const [consent, setConsent] = useState(settings.recordingConsent);
  const [retention, setRetention] = useState(settings.retentionDays);
  const changed = consent !== settings.recordingConsent || retention !== settings.retentionDays;

  const save = async () => {
    try {
      await update.mutateAsync({ recordingConsent: consent, retentionDays: retention });
      toast.success("Consent and retention saved.");
    } catch {
      toast.error("Couldn't save these settings. Try again.");
    }
  };

  return (
    <form
      className="max-w-xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (changed) void save();
      }}
    >
      <fieldset className="space-y-1" disabled={!canEdit}>
        <legend className="text-sm font-medium text-coal">Call consent</legend>
        <div className="divide-y divide-cinder border-y border-cinder">
          {CONSENT.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-start gap-3 py-3">
              <input
                type="radio"
                name="consent"
                value={option.value}
                checked={consent === option.value}
                onChange={() => setConsent(option.value)}
                className="mt-1 size-4 accent-coal"
              />
              <span>
                <span className="block text-sm font-medium text-coal">{option.label}</span>
                <span className="block text-detail text-smoke">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1">
        <label htmlFor="retention" className="text-sm font-medium text-coal">
          Keep transcripts for
        </label>
        <p className="text-detail text-smoke">
          After this, transcripts are deleted. Summaries stay.
        </p>
        <select
          id="retention"
          value={retention}
          disabled={!canEdit}
          onChange={(event) => setRetention(Number(event.target.value))}
          className={selectClass}
        >
          {(RETENTION.includes(retention)
            ? RETENTION
            : [...RETENTION, retention].sort((a, b) => a - b)
          ).map((value) => (
            <option key={value} value={value}>
              {plural(value, "day")}
            </option>
          ))}
        </select>
      </div>
      {canEdit ? (
        <Button type="submit" variant="primary" disabled={!changed || update.isPending}>
          Save changes
        </Button>
      ) : null}
      <ReadOnlyNote canEdit={canEdit} />
    </form>
  );
}

const INTEGRATION_NOTE: Record<string, string> = {
  teams: "Joins your calls and streams the transcript.",
  outlook: "Reads the thread and sends follow-ups.",
  clickup: "Keeps tasks in step with your ClickUp lists.",
};

export function Integrations({ settings }: { settings: Settings }) {
  return (
    <div className="max-w-xl space-y-3">
      <ul className="divide-y divide-cinder border-y border-cinder">
        {settings.integrations.map((integration) => (
          <li
            key={integration.id}
            className="flex min-h-14 items-center justify-between gap-4 py-2"
          >
            <div>
              <p className="text-sm font-medium text-coal">{integration.name}</p>
              <p className="text-detail text-smoke">{INTEGRATION_NOTE[integration.id] ?? ""}</p>
            </div>
            <StatusPill tone={integration.status === "connected" ? "done" : "neutral"}>
              {integration.status === "connected" ? "Connected" : "Not connected"}
            </StatusPill>
          </li>
        ))}
      </ul>
      <p className="text-detail text-smoke">Your admin connects these during rollout.</p>
    </div>
  );
}

const ROLE_NAME = { rep: "Sales rep", lead: "Team lead", admin: "Admin" } as const;

export function UsersAndRoles() {
  const { data, isPending, isError, refetch } = useUsers();
  if (isPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="Couldn't load users"
        description="Check your connection and try again."
        onRetry={() => void refetch()}
      />
    );
  }
  if (data.length === 0) {
    return <EmptyState title="No users yet" description="People appear here once they sign in." />;
  }
  return (
    <table className="w-full max-w-3xl text-left text-sm">
      <caption className="sr-only">Users and roles</caption>
      <thead>
        <tr className="border-b border-cinder text-detail text-smoke">
          <th scope="col" className="py-2 pr-4 font-medium">
            Name
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Email
          </th>
          <th scope="col" className="py-2 font-medium">
            Role
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-cinder">
        {data.map((user) => (
          <tr key={user.id}>
            <th scope="row" className="h-14 pr-4 font-medium text-coal">
              {user.name}
            </th>
            <td className="pr-4 text-coal">{user.email}</td>
            <td className="text-coal">{ROLE_NAME[user.role]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AiUsage({ settings }: { settings: Settings }) {
  const { month, answers, costUsd } = settings.aiUsage;
  const perAnswer = answers ? costUsd / answers : 0;
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-detail text-smoke">{month}</p>
      <div className="grid grid-cols-3 gap-6">
        <div className="border-t border-cinder pt-3">
          <p className="text-detail text-smoke">Answers</p>
          <p className="text-2xl font-semibold text-coal">{answers.toLocaleString("en-US")}</p>
        </div>
        <div className="border-t border-cinder pt-3">
          <p className="text-detail text-smoke">Cost</p>
          <p className="text-2xl font-semibold text-coal">${costUsd.toFixed(2)}</p>
        </div>
        <div className="border-t border-cinder pt-3">
          <p className="text-detail text-smoke">Per answer</p>
          <p className="text-2xl font-semibold text-coal">${perAnswer.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}

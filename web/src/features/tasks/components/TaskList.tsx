"use client";

import { useUpdateTask, type Task } from "@ember/api";
import { StatusPill } from "@ember/ui";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { dateTime } from "@/lib/format";

/** Tasks with a checkbox each. Checking one marks it done; unchecking reopens it. */
export function TaskList({
  rows,
  label,
  showCompany = true,
}: {
  rows: { task: Task; company: string }[];
  label: string;
  showCompany?: boolean;
}) {
  const update = useUpdateTask();
  // Read once per mount: "overdue" is judged as of when the list opened.
  const [now] = useState(() => Date.now());
  return (
    <ul aria-label={label} className="divide-y divide-cinder border-y border-cinder">
      {rows.map(({ task, company }) => {
        const done = task.status === "done";
        const overdue = !done && new Date(task.dueAt).getTime() < now;
        return (
          <li key={task.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
            <label className="flex min-w-0 flex-1 basis-64 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={done}
                disabled={update.isPending}
                onChange={() =>
                  update.mutate(
                    { id: task.id, status: done ? "open" : "done" },
                    { onError: () => toast.error("Couldn't update that task. Try again.") },
                  )
                }
                className="size-4 shrink-0 accent-coal"
              />
              <span className={done ? "text-smoke line-through" : "text-coal"}>{task.title}</span>
            </label>
            {showCompany ? (
              <Link
                href={`/deals/${task.dealId}`}
                className="text-sm text-smoke underline-offset-2 hover:text-coal hover:underline"
              >
                {company}
              </Link>
            ) : null}
            {overdue ? <StatusPill tone="overdue">Overdue</StatusPill> : null}
            <span className="w-32 text-right text-detail text-smoke">
              {done ? "Done" : `Due ${dateTime(task.dueAt)}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

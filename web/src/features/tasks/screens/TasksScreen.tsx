"use client";

import { useTasks } from "@ember/api";
import { EmptyState, ErrorState, Segmented, Skeleton } from "@ember/ui";
import { useState } from "react";
import { TaskList } from "../components/TaskList";

type Filter = "open" | "done" | "all";

export function TasksScreen() {
  const [filter, setFilter] = useState<Filter>("open");
  const { data, isPending, isError, refetch } = useTasks(
    filter === "all" ? {} : { status: filter },
  );

  return (
    <div className="max-w-4xl space-y-4">
      <Segmented
        label="Show tasks"
        value={filter}
        onValueChange={setFilter}
        options={[
          { value: "open", label: "Open" },
          { value: "done", label: "Done" },
          { value: "all", label: "All" },
        ]}
      />
      {isPending ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Couldn't load your tasks"
          description="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : data.length === 0 ? (
        <EmptyState
          title={filter === "done" ? "Nothing is done yet" : "No open tasks"}
          description={
            filter === "done"
              ? "Tasks you finish appear here."
              : "Tasks are added when you approve a call summary."
          }
        />
      ) : (
        <TaskList rows={data} label="Tasks" />
      )}
    </div>
  );
}

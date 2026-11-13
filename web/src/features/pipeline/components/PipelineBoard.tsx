"use client";

import type { Deal, Stage, User } from "@ember/api";
import { HeatIndicator, SpringBoard, SpringTile, cn } from "@ember/ui";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { money } from "@/lib/format";
import { STAGE_LABEL, STAGES } from "@/lib/stages";

const collide: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : rectIntersection(args);
};

function TileBody({ deal, owner }: { deal: Deal; owner: User | undefined }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-coal">{money(deal.value)}</span>
      <span className="flex items-center gap-2">
        <HeatIndicator heat={deal.heat} lastActivity={deal.lastActivityNote} />
        {owner ? (
          <span title={owner.name}>
            <Avatar initials={owner.initials} className="size-6 text-[11px]" />
            <span className="sr-only">Owner {owner.name}</span>
          </span>
        ) : deal.ownerId ? null : (
          <span className="text-detail text-smoke">No owner</span>
        )}
      </span>
    </div>
  );
}

function DealTile({ deal, owner }: { deal: Deal; owner: User | undefined }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });
  return (
    <SpringTile id={deal.id} dimmed={isDragging}>
      <div
        ref={setNodeRef}
        className="rounded-control border border-cinder bg-paper p-2 transition-instant hover:border-smoke"
      >
        <div className="flex items-start gap-1">
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`Move ${deal.company}`}
            className="-ml-1 mt-px flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-smoke hover:text-coal active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
          <Link
            href={`/deals/${deal.id}`}
            className="min-w-0 flex-1 break-words text-sm font-medium text-coal underline-offset-2 hover:underline"
          >
            {deal.company}
          </Link>
        </div>
        <div className="mt-1.5 pl-5">
          <TileBody deal={deal} owner={owner} />
        </div>
      </div>
    </SpringTile>
  );
}

function Column({
  stage,
  deals,
  owners,
}: {
  stage: Stage;
  deals: Deal[];
  owners: Map<string, User>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = deals.reduce((sum, deal) => sum + deal.value, 0);
  return (
    <section
      ref={setNodeRef}
      aria-label={STAGE_LABEL[stage]}
      className={cn(
        "flex min-h-64 flex-col rounded-panel border bg-iris-wash/40 p-2 transition-instant",
        isOver ? "border-iris" : "border-cinder",
      )}
    >
      <header className="px-1 pb-2">
        <h2 className="text-sm font-medium text-coal">{STAGE_LABEL[stage]}</h2>
        <p className="text-detail text-smoke">
          <span className="tabular-nums">{deals.length}</span>{" "}
          {deals.length === 1 ? "deal" : "deals"}, {money(total)}
        </p>
      </header>
      <ul className="flex flex-1 flex-col gap-2">
        {deals.map((deal) => (
          <li key={deal.id}>
            <DealTile deal={deal} owner={deal.ownerId ? owners.get(deal.ownerId) : undefined} />
          </li>
        ))}
      </ul>
      {deals.length === 0 ? (
        <p className="px-1 py-4 text-detail text-smoke">Drop a deal here.</p>
      ) : null}
    </section>
  );
}

/** Stages as columns. Drag a tile by its grip, or focus the grip and use Space and the arrow keys. */
// Arrow keys hop to the neighbouring column instead of nudging by a few pixels.
const columnStep: KeyboardCoordinateGetter = (event, { context }) => {
  const { droppableRects, droppableContainers, collisionRect } = context;
  if (!collisionRect || (event.code !== "ArrowRight" && event.code !== "ArrowLeft")) {
    return undefined;
  }
  event.preventDefault();
  const columns = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      return rect ? [rect] : [];
    })
    .sort((a, b) => a.left - b.left);
  const centre = collisionRect.left + collisionRect.width / 2;
  const index = columns.findIndex(
    (rect) => centre >= rect.left && centre <= rect.left + rect.width,
  );
  const target = columns[index + (event.code === "ArrowRight" ? 1 : -1)];
  return target ? { x: target.left + 8, y: target.top + 8 } : undefined;
};

export function PipelineBoard({
  deals,
  owners,
  onMove,
}: {
  deals: Deal[];
  owners: Map<string, User>;
  onMove: (deal: Deal, stage: Stage) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnStep }),
  );
  const byId = new Map(deals.map((deal) => [deal.id, deal]));
  const name = (id: string | number) => byId.get(String(id))?.company ?? "Deal";
  const stageName = (id: string | number) => STAGE_LABEL[String(id) as Stage] ?? String(id);
  const active = activeId ? byId.get(activeId) : undefined;

  const end = ({ active: dragged, over }: DragEndEvent) => {
    setActiveId(null);
    const deal = byId.get(String(dragged.id));
    if (deal && over && deal.stage !== over.id) onMove(deal, over.id as Stage);
  };

  return (
    <SpringBoard>
      <DndContext
        sensors={sensors}
        collisionDetection={collide}
        onDragStart={({ active: a }) => setActiveId(String(a.id))}
        onDragEnd={end}
        onDragCancel={() => setActiveId(null)}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "To move this deal, press Space, then the left or right arrow keys to choose a stage, then Space to drop it. Press Escape to cancel.",
          },
          announcements: {
            onDragStart: ({ active: a }) => `Picked up ${name(a.id)}.`,
            onDragOver: ({ active: a, over }) =>
              over
                ? `${name(a.id)} is over ${stageName(over.id)}.`
                : `${name(a.id)} is not over a stage.`,
            onDragEnd: ({ active: a, over }) =>
              over
                ? `${name(a.id)} was dropped in ${stageName(over.id)}.`
                : `${name(a.id)} was not moved.`,
            onDragCancel: ({ active: a }) => `Moving ${name(a.id)} was cancelled.`,
          },
        }}
      >
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[64rem] grid-cols-6 gap-3">
            {STAGES.map((stage) => (
              <Column
                key={stage}
                stage={stage}
                deals={deals.filter((deal) => deal.stage === stage)}
                owners={owners}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {active ? (
            <div className="rounded-control border border-smoke bg-paper p-2 shadow-float">
              <p className="truncate text-sm font-medium text-coal">{active.company}</p>
              <div className="mt-1.5">
                <TileBody
                  deal={active}
                  owner={active.ownerId ? owners.get(active.ownerId) : undefined}
                />
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </SpringBoard>
  );
}

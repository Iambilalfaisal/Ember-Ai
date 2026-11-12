"use client";

import { Button, Popover, PopoverContent, PopoverTrigger, Tooltip, cn } from "@ember/ui";
import { useMarkNotificationsRead, useNotifications } from "@ember/api";
import { formatDistanceToNowStrict } from "date-fns";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const unread = data?.unread ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content="Notifications">
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
            className={cn("gap-1", unread > 0 && "w-auto px-2.5")}
          >
            <Bell aria-hidden="true" className="size-[18px]" />
            {unread > 0 ? (
              <span className="min-w-5 rounded-pill bg-coal px-1.5 text-center text-xs leading-5 tabular-nums text-paper">
                {unread}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex h-12 items-center justify-between border-b border-cinder pl-4 pr-2">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <Button
            variant="ghost"
            size="sm"
            disabled={unread === 0 || markRead.isPending}
            onClick={() => markRead.mutate(undefined)}
          >
            Mark all as read
          </Button>
        </div>
        {data && data.items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-smoke">
            {"You're up to date. New notifications appear here."}
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {data?.items.map((n) => (
              <li key={n.id} className="border-b border-cinder last:border-b-0">
                <Link
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="flex gap-3 px-4 py-3 transition-instant hover:bg-ash"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-pill",
                      n.read ? "bg-transparent" : "bg-coal",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !n.read && "font-medium")}>{n.title}</span>
                    <span className="mt-0.5 block text-detail text-smoke">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-detail text-smoke">
                    {formatDistanceToNowStrict(new Date(n.createdAt))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

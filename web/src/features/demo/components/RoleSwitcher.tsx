"use client";

import { isDemoMode, useMe, useUsers } from "@ember/api";
import { Avatar } from "@/components/Avatar";
import { cn } from "@ember/ui";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { HOME, ROLE_LABEL } from "@/lib/routes";
import { useSession } from "@/lib/session";
import { useRouter } from "next/navigation";

/** Demo only. Pick who you are: navigation and data change with the person. */
export function RoleSwitcher() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: users } = useUsers();
  const signIn = useSession((s) => s.signIn);

  if (!isDemoMode()) return null;

  return (
    <div className="mt-4 border-t border-cinder pt-4">
      <p className="mb-2 text-detail font-medium">View as</p>
      <ul className="space-y-0.5">
        {users?.map((user) => {
          const selected = user.id === me?.id;
          return (
            <li key={user.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  if (selected) return;
                  signIn(user.id);
                  router.push(HOME[user.role]);
                  toast(`Now viewing as ${user.name}.`);
                }}
                className={cn(
                  "flex h-11 w-full items-center gap-3 rounded-control px-2 text-left transition-instant hover:bg-coal/8",
                  selected && "bg-coal/8",
                )}
              >
                <Avatar initials={user.initials} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-sm">{user.name}</span>
                  <span className="block text-xs text-smoke">{ROLE_LABEL[user.role]}</span>
                </span>
                {selected ? <Check aria-hidden="true" className="size-4" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

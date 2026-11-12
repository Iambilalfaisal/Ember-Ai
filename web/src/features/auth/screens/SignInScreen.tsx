"use client";

import { isDemoMode, useUsers } from "@ember/api";
import { DemoBadge, ErrorState, Skeleton } from "@ember/ui";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { HOME, ROLE_LABEL } from "@/lib/routes";
import { useSession } from "@/lib/session";

export function SignInScreen() {
  const router = useRouter();
  const signIn = useSession((s) => s.signIn);
  const { data: users, isError, refetch } = useUsers();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">Ember</span>
        {isDemoMode() ? <DemoBadge /> : null}
      </div>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-smoke">
        {
          "This demo doesn't use real accounts. Choose who you want to be. Navigation and data change with the person."
        }
      </p>

      <div className="mt-6">
        {isError ? (
          <ErrorState
            title="Couldn't load the demo accounts"
            description="Check your connection and try again."
            onRetry={() => void refetch()}
            className="py-0"
          />
        ) : users ? (
          <ul className="divide-y divide-cinder rounded-panel border border-cinder bg-paper">
            {users.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  aria-label={`Sign in as ${user.name}`}
                  onClick={() => {
                    signIn(user.id);
                    router.push(HOME[user.role]);
                  }}
                  className="flex h-14 w-full items-center gap-3 px-4 text-left transition-instant hover:bg-ash"
                >
                  <Avatar initials={user.initials} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-sm font-medium">{user.name}</span>
                    <span className="block text-detail text-smoke">{ROLE_LABEL[user.role]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-2" aria-busy="true" aria-label="Loading accounts">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
      </div>
    </main>
  );
}

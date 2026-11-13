"use client";

import { isDemoMode, useUsers } from "@ember/api";
import { Aura, DemoBadge, ErrorState, Rise, Skeleton } from "@ember/ui";
import { BookOpen, Radio, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { BrandMark } from "@/components/SideNav";
import { HOME, ROLE_LABEL } from "@/lib/routes";
import { useSession } from "@/lib/session";

const POINTS = [
  { icon: Radio, text: "Live help on the call, with every answer tied to a source." },
  { icon: Sparkles, text: "Follow-ups drafted and waiting before you ask." },
  { icon: BookOpen, text: "Your team's knowledge base, one question away." },
];

export function SignInScreen() {
  const router = useRouter();
  const signIn = useSession((s) => s.signIn);
  const { data: users, isError, refetch } = useUsers();

  return (
    <div className="grid min-h-screen bg-ash lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside
        data-surface="nav"
        className="relative hidden overflow-hidden bg-nav-rail p-12 text-nav-ink lg:flex lg:flex-col lg:justify-between"
      >
        <Aura className="-left-24 -right-auto top-1/3 size-96 bg-nav-accent/20" />
        <div className="relative flex items-center gap-3">
          <BrandMark className="size-10" />
          <span className="text-xl font-semibold tracking-tight">Ember</span>
        </div>
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold">The sales copilot that keeps every call warm.</p>
          <ul className="mt-8 space-y-4">
            {POINTS.map((point, index) => (
              <Rise as="li" index={index + 1} key={point.text} className="flex gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-control bg-nav-active text-nav-accent"
                >
                  <point.icon className="size-4" />
                </span>
                <span className="pt-1 text-nav-muted">{point.text}</span>
              </Rise>
            ))}
          </ul>
        </div>
        <p className="relative text-detail text-nav-muted">
          Built for sales teams that listen first.
        </p>
      </aside>

      <main className="relative flex flex-col justify-center overflow-hidden px-6 py-12 sm:px-12">
        <div className="relative mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <BrandMark />
              Ember
            </span>
            {isDemoMode() ? <DemoBadge /> : null}
          </div>
          <div className="mb-2 hidden justify-end lg:flex">
            {isDemoMode() ? <DemoBadge /> : null}
          </div>
          <h1 className="text-3xl font-semibold">Sign in</h1>
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
              />
            ) : users ? (
              <ul className="space-y-2">
                {users.map((user, index) => (
                  <Rise as="li" index={index} key={user.id}>
                    <button
                      type="button"
                      aria-label={`Sign in as ${user.name}`}
                      onClick={() => {
                        signIn(user.id);
                        router.push(HOME[user.role]);
                      }}
                      className="flex h-16 w-full items-center gap-3 rounded-panel border border-cinder bg-paper px-4 text-left shadow-card transition-ui hover:-translate-y-0.5 hover:border-iris/50 hover:shadow-lift"
                    >
                      <Avatar initials={user.initials} className="size-10" />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block text-sm font-medium">{user.name}</span>
                        <span className="block text-detail text-smoke">
                          {ROLE_LABEL[user.role]}
                        </span>
                      </span>
                    </button>
                  </Rise>
                ))}
              </ul>
            ) : (
              <div className="space-y-2" aria-busy="true" aria-label="Loading accounts">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

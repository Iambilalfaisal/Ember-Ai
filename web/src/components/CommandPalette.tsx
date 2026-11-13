"use client";

import { isDemoMode, useCalls, useDeals, useMe, useResetDemo, useUsers } from "@ember/api";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@ember/ui";
import { Command } from "cmdk";
import { CornerDownLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { HOME, navFor, ROLE_LABEL, SETTINGS_SECTIONS } from "@/lib/routes";
import { useSession } from "@/lib/session";
import { applyTheme, usePrefs } from "@/lib/prefs";
import { useUi } from "@/lib/ui";

const ITEM =
  "flex h-9 cursor-pointer items-center gap-3 rounded-control px-3 text-sm text-coal data-[selected=true]:bg-iris-wash data-[selected=true]:text-iris-ink";
const GROUP =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-detail [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-smoke";

function Row({ children, hint }: { children: ReactNode; hint?: string | undefined }) {
  return (
    <>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="shrink-0 text-detail text-smoke">{hint}</span> : null}
    </>
  );
}

/** Ctrl+K or Cmd+K. Jump to any page, opportunity or call, or run a demo action. */
export function CommandPalette() {
  const router = useRouter();
  const demo = isDemoMode();
  const signIn = useSession((s) => s.signIn);
  const signOut = useSession((s) => s.signOut);
  const reset = useResetDemo();
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const { data: me } = useMe();
  const { data: deals } = useDeals();
  const { data: calls } = useCalls();
  const { data: users } = useUsers();
  const setTheme = usePrefs((s) => s.setTheme);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setOpen(!useUi.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  if (!me) return null;

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const run = (action: () => void) => {
    setOpen(false);
    action();
  };
  const onSignOut = () => {
    signOut();
    router.push("/sign-in");
  };
  const onResetDemo = () =>
    reset.mutate(undefined, { onSuccess: () => toast("Demo reset to its starting point.") });
  const onSwitchUser = (userId: string) => {
    const person = users?.find((u) => u.id === userId);
    if (!person) return;
    signIn(person.id);
    router.push(HOME[person.role]);
    toast(`Now viewing as ${person.name}.`);
  };
  const scenarioCall = calls?.find((c) => c.scenarioId);
  const showSettings = navFor(me.role).some((i) => i.href === "/settings");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[20%] w-[min(40rem,calc(100vw-32px))] translate-y-0 p-0">
        <DialogTitle className="sr-only">Search or jump to</DialogTitle>
        <DialogDescription className="sr-only">
          Type to find a page, an opportunity, a call or an action.
        </DialogDescription>
        <Command label="Search or jump to">
          <Command.Input
            autoFocus
            placeholder="Search pages, opportunities and calls"
            className="h-12 w-full border-b border-cinder bg-transparent px-4 text-sm outline-none placeholder:text-smoke"
          />
          <Command.List className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-sm text-smoke">
              Nothing matches. Try a company name or a page.
            </Command.Empty>

            <Command.Group heading="Pages" className={GROUP}>
              {navFor(me.role).map((item) => (
                <Command.Item
                  key={item.href}
                  value={`page ${item.label}`}
                  keywords={[item.description]}
                  onSelect={() => go(item.href)}
                  className={ITEM}
                >
                  <item.icon aria-hidden="true" className="size-4 shrink-0 text-smoke" />
                  <Row>{item.label}</Row>
                </Command.Item>
              ))}
              <Command.Item
                value="page Test console"
                keywords={["ask the knowledge base", "question"]}
                onSelect={() => go("/knowledge/test")}
                className={ITEM}
              >
                <span aria-hidden="true" className="size-4 shrink-0" />
                <Row hint="Knowledge base">Test console</Row>
              </Command.Item>
              {showSettings
                ? SETTINGS_SECTIONS.map((s) => (
                    <Command.Item
                      key={s.slug}
                      value={`settings ${s.label}`}
                      onSelect={() => go(`/settings/${s.slug}`)}
                      className={ITEM}
                    >
                      <span aria-hidden="true" className="size-4 shrink-0" />
                      <Row hint="Settings">{s.label}</Row>
                    </Command.Item>
                  ))
                : null}
            </Command.Group>

            {deals && deals.length > 0 ? (
              <Command.Group heading="Opportunities" className={GROUP}>
                {deals.map((d) => (
                  <Command.Item
                    key={d.id}
                    value={`opportunity ${d.company}`}
                    onSelect={() => go(`/deals/${d.id}`)}
                    className={ITEM}
                  >
                    <span aria-hidden="true" className="size-4 shrink-0" />
                    <Row hint={d.stage}>{d.company}</Row>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {calls && calls.length > 0 ? (
              <Command.Group heading="Calls" className={GROUP}>
                {calls.map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`call ${c.company}`}
                    onSelect={() =>
                      go(c.status === "upcoming" ? `/calls/${c.id}/prep` : `/calls/${c.id}`)
                    }
                    className={ITEM}
                  >
                    <span aria-hidden="true" className="size-4 shrink-0" />
                    <Row hint={c.status === "upcoming" ? "Brief" : "Completed"}>{c.company}</Row>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            <Command.Group heading="Actions" className={GROUP}>
              <Command.Item
                value="action Light theme"
                onSelect={() => run(() => setTheme("light"))}
                className={ITEM}
              >
                <Row>Use the light theme</Row>
              </Command.Item>
              <Command.Item
                value="action Dark theme"
                onSelect={() => run(() => setTheme("dark"))}
                className={ITEM}
              >
                <Row>Use the dark theme</Row>
              </Command.Item>
              <Command.Item
                value="action System theme"
                onSelect={() =>
                  run(() => {
                    setTheme("system");
                    applyTheme("system");
                  })
                }
                className={ITEM}
              >
                <Row>Follow the system theme</Row>
              </Command.Item>
              <Command.Item
                value="action Sign out"
                onSelect={() => run(onSignOut)}
                className={ITEM}
              >
                <Row>Sign out</Row>
              </Command.Item>
            </Command.Group>

            {demo ? (
              <Command.Group heading="Demo" className={GROUP}>
                {scenarioCall ? (
                  <Command.Item
                    value="demo Play the live call scenario"
                    keywords={["blue harbor", "start call"]}
                    onSelect={() => go(`/live/${scenarioCall.id}`)}
                    className={ITEM}
                  >
                    <Row>Play the live call scenario</Row>
                  </Command.Item>
                ) : null}
                <Command.Item
                  value="demo Reset demo"
                  onSelect={() => run(onResetDemo)}
                  className={ITEM}
                >
                  <Row>Reset demo</Row>
                </Command.Item>
                {users
                  ?.filter((u) => u.id !== me.id)
                  .map((u) => (
                    <Command.Item
                      key={u.id}
                      value={`demo Switch to ${u.name}`}
                      keywords={[ROLE_LABEL[u.role]]}
                      onSelect={() => run(() => onSwitchUser(u.id))}
                      className={ITEM}
                    >
                      <Row hint={ROLE_LABEL[u.role]}>Switch to {u.name}</Row>
                    </Command.Item>
                  ))}
              </Command.Group>
            ) : null}
          </Command.List>
          <div className="flex h-9 items-center gap-2 border-t border-cinder px-4 text-detail text-smoke">
            <CornerDownLeft aria-hidden="true" className="size-3.5" />
            <span>Open</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

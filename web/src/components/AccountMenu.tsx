"use client";

import { useMe } from "@ember/api";
import { Button, Popover, PopoverContent, PopoverTrigger, Segmented } from "@ember/ui";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ROLE_LABEL } from "@/lib/routes";
import { usePrefs, type ThemeChoice } from "@/lib/prefs";
import { useSession } from "@/lib/session";
import { Avatar } from "./Avatar";

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** The signed-in person, with theme, the role switcher (demo only) and sign out. */
export function AccountMenu({ roleSwitcher }: { roleSwitcher?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data: me } = useMe();
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const signOut = useSession((s) => s.signOut);

  if (!me) return <div aria-hidden="true" className="size-9" />;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${me.name}`}
          className="flex h-9 items-center gap-2 rounded-control pl-1 pr-2 transition-instant hover:bg-iris-wash"
        >
          <Avatar initials={me.initials} />
          <span className="hidden text-left leading-tight md:block">
            <span className="block text-detail font-medium">{me.name}</span>
            <span className="block text-xs text-smoke">{ROLE_LABEL[me.role]}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="text-sm font-semibold">{me.name}</p>
        <p className="text-detail text-smoke">{ROLE_LABEL[me.role]}</p>

        {roleSwitcher}

        <div className="mt-4 border-t border-cinder pt-4">
          <p className="mb-2 text-detail font-medium">Theme</p>
          <Segmented label="Theme" value={theme} onValueChange={setTheme} options={THEMES} />
        </div>

        <Button
          className="mt-4 w-full"
          onClick={() => {
            setOpen(false);
            signOut();
            router.push("/sign-in");
          }}
        >
          Sign out
        </Button>
      </PopoverContent>
    </Popover>
  );
}

import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { CommandPalette } from "@/components/CommandPalette";
import { DemoControls, RoleSwitcher } from "@/features/demo";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      demoControls={<DemoControls />}
      roleSwitcher={<RoleSwitcher />}
      palette={<CommandPalette />}
    >
      {children}
    </AppShell>
  );
}

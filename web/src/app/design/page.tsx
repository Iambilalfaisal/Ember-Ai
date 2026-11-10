import type { Metadata } from "next";
import { DesignScreen } from "@/features/design";

export const metadata: Metadata = { title: "Design system" };

export default function DesignPage() {
  return <DesignScreen />;
}

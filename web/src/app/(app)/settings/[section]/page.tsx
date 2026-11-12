import { notFound } from "next/navigation";
import { RoutePlaceholder } from "@/components/RoutePlaceholder";
import { SETTINGS_SECTIONS } from "@/lib/routes";

export default async function SettingsSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const found = SETTINGS_SECTIONS.find((s) => s.slug === section);
  if (!found) notFound();
  return (
    <RoutePlaceholder
      title={found.label}
      description="This is where you will review and change these settings."
    />
  );
}

"use client";

import { SETTINGS_SECTIONS } from "@/lib/routes";
import { SettingsNav } from "../components/SettingsNav";
import {
  AiUsage,
  ConsentAndRetention,
  FollowUpRules,
  Integrations,
  SettingsData,
  UsersAndRoles,
} from "../components/Sections";

type Slug = (typeof SETTINGS_SECTIONS)[number]["slug"];

function Section({ slug }: { slug: Slug }) {
  if (slug === "users-and-roles") return <UsersAndRoles />;
  return (
    <SettingsData>
      {(settings, canEdit) => {
        switch (slug) {
          case "follow-up-rules":
            return <FollowUpRules settings={settings} canEdit={canEdit} />;
          case "consent-and-retention":
            return <ConsentAndRetention settings={settings} canEdit={canEdit} />;
          case "integrations":
            return <Integrations settings={settings} />;
          case "ai-usage":
            return <AiUsage settings={settings} />;
          default:
            return null;
        }
      }}
    </SettingsData>
  );
}

export function SettingsScreen({ slug }: { slug: Slug }) {
  const label = SETTINGS_SECTIONS.find((s) => s.slug === slug)?.label;
  return (
    <div className="flex gap-10">
      <SettingsNav />
      <section aria-labelledby="settings-heading" className="min-w-0 flex-1 space-y-4">
        <h2 id="settings-heading" className="sr-only">
          {label}
        </h2>
        <Section slug={slug} />
      </section>
    </div>
  );
}

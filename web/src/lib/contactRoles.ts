import type { ContactRole } from "@ember/api";

export const CONTACT_ROLE_LABEL: Record<ContactRole, string> = {
  decision_maker: "Decision maker",
  champion: "Champion",
  influencer: "Influencer",
  user: "User",
  other: "Other",
};

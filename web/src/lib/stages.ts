import { stages, type Stage } from "@ember/api";

export const STAGES: readonly Stage[] = stages;

export const STAGE_LABEL: Record<Stage, string> = {
  discovery: "Discovery",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Closed won",
  lost: "Closed lost",
};

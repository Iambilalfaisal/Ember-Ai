import type { KnowledgeDocument } from "@ember/api";

export const DOC_TYPE_LABEL: Record<KnowledgeDocument["docType"], string> = {
  guide: "Guide",
  faq: "FAQ",
  pricing: "Pricing",
  security: "Security",
  case_study: "Case study",
  policy: "Policy",
};

export const DOC_TYPES = Object.keys(DOC_TYPE_LABEL) as KnowledgeDocument["docType"][];

export const selectClass =
  "h-9 rounded-control border border-smoke bg-paper px-2 text-sm text-coal transition-instant hover:border-coal";

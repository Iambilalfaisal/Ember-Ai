import type { AuditAction, SuggestionKind } from "@ember/api";
import {
  ArrowRightLeft,
  CalendarClock,
  CheckSquare,
  FilePenLine,
  Mail,
  PhoneCall,
  RotateCcw,
  UserCheck,
  UserX,
  type LucideIcon,
} from "lucide-react";

export const ACTION_META: Record<AuditAction, { label: string; Icon: LucideIcon }> = {
  next_action_set: { label: "Next action set", Icon: CalendarClock },
  draft_created: { label: "Draft prepared", Icon: FilePenLine },
  draft_sent: { label: "Follow-up sent", Icon: Mail },
  tasks_created: { label: "Tasks created", Icon: CheckSquare },
  stage_changed: { label: "Stage changed", Icon: ArrowRightLeft },
  call_logged: { label: "Call logged", Icon: PhoneCall },
  owner_assigned: { label: "Owner assigned", Icon: UserCheck },
  opted_out: { label: "Contact opted out", Icon: UserX },
  deal_revived: { label: "Deal revived", Icon: RotateCcw },
};

export const KIND_LABEL: Record<SuggestionKind, string> = {
  set_next_action: "Set a next action",
  nudge_draft: "Prepare a follow-up",
  revive: "Bring it back",
  assign_owner: "Assign an owner",
};

/** Where to send the person once they have approved a suggestion, and what to call it. */
export function afterApproval(
  kind: SuggestionKind,
  dealId: string,
): { href: string; label: string } {
  switch (kind) {
    case "set_next_action":
      return { href: `/deals/${dealId}`, label: "See it on the opportunity" };
    case "nudge_draft":
    case "revive":
      return { href: "/my-day", label: "Review the draft in My Day" };
    case "assign_owner":
      return { href: "/team", label: "See it in Team view" };
  }
}

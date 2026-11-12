import {
  BookOpen,
  ChartNoAxesColumn,
  Columns3,
  Contact,
  Inbox,
  ListChecks,
  Phone,
  RotateCcw,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type Role = "rep" | "lead" | "admin";

export const ROLE_LABEL: Record<Role, string> = {
  rep: "Sales rep",
  lead: "Team lead",
  admin: "Admin",
};

/** Where each role lands after signing in or switching to that role. */
export const HOME: Record<Role, string> = {
  rep: "/my-day",
  lead: "/team",
  admin: "/knowledge",
};

const EVERYONE: Role[] = ["rep", "lead", "admin"];
const LEADS: Role[] = ["lead", "admin"];

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** What the screen is for. The command palette searches it. */
  description: string;
};

/** The rail, in order. Each role sees only what it can use. */
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/my-day",
    label: "My Day",
    icon: Inbox,
    roles: EVERYONE,
    description: "Opportunities that need you today",
  },
  {
    href: "/calls",
    label: "Calls",
    icon: Phone,
    roles: EVERYONE,
    description: "Upcoming calls, the call library and summaries",
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: ListChecks,
    roles: EVERYONE,
    description: "Follow-ups and commitments",
  },
  {
    href: "/pipeline",
    label: "Pipeline",
    icon: Columns3,
    roles: EVERYONE,
    description: "Opportunities by stage",
  },
  {
    href: "/contacts",
    label: "Contacts",
    icon: Contact,
    roles: EVERYONE,
    description: "People at your opportunities",
  },
  {
    href: "/team",
    label: "Team view",
    icon: Users,
    roles: LEADS,
    description: "Stalled and unassigned opportunities",
  },
  {
    href: "/revival",
    label: "Revival queue",
    icon: RotateCcw,
    roles: EVERYONE,
    description: "Older opportunities worth another try",
  },
  {
    href: "/knowledge",
    label: "Knowledge base",
    icon: BookOpen,
    roles: EVERYONE,
    description: "The documents answers come from",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: ChartNoAxesColumn,
    roles: LEADS,
    description: "Pilot metrics by week",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    roles: LEADS,
    description: "Follow-up rules, consent, integrations, users and AI usage",
  },
];

export const SETTINGS_SECTIONS = [
  { slug: "follow-up-rules", label: "Follow-up rules" },
  { slug: "consent-and-retention", label: "Consent and retention" },
  { slug: "integrations", label: "Integrations" },
  { slug: "users-and-roles", label: "Users and roles" },
  { slug: "ai-usage", label: "AI usage and cost" },
] as const;

export const navFor = (role: Role): NavItem[] => NAV_ITEMS.filter((i) => i.roles.includes(role));

// Pages that are not in the rail. Order matters: the first pattern that matches wins.
const OTHER_PAGES: { pattern: RegExp; title: string; roles: Role[] }[] = [
  { pattern: /^\/knowledge\/test$/, title: "Test console", roles: EVERYONE },
  { pattern: /^\/deals\/[^/]+$/, title: "Opportunity", roles: EVERYONE },
  { pattern: /^\/calls\/[^/]+\/review$/, title: "Review summary", roles: EVERYONE },
  { pattern: /^\/calls\/[^/]+\/prep$/, title: "Call brief", roles: EVERYONE },
  { pattern: /^\/calls\/[^/]+$/, title: "Call", roles: EVERYONE },
  { pattern: /^\/live\/[^/]+$/, title: "Live call", roles: EVERYONE },
  { pattern: /^\/design$/, title: "Design system", roles: EVERYONE },
];

const inSection = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/** The nav item a path belongs to, so Calls stays lit on a call and Settings on a section. */
export function navItemFor(pathname: string): NavItem | undefined {
  if (pathname.startsWith("/live/")) return NAV_ITEMS.find((i) => i.href === "/calls");
  if (pathname.startsWith("/deals/")) return NAV_ITEMS.find((i) => i.href === "/pipeline");
  return NAV_ITEMS.find((i) => inSection(pathname, i.href));
}

export function titleFor(pathname: string): string {
  const other = OTHER_PAGES.find((p) => p.pattern.test(pathname));
  if (other) return other.title;
  const section = SETTINGS_SECTIONS.find((s) => pathname === `/settings/${s.slug}`);
  if (section) return section.label;
  return NAV_ITEMS.find((i) => inSection(pathname, i.href))?.label ?? "Ember";
}

/** Whether a role may open a path. Anything not in the rail follows its section. */
export function canOpen(pathname: string, role: Role): boolean {
  const other = OTHER_PAGES.find((p) => p.pattern.test(pathname));
  if (other) return other.roles.includes(role);
  const item = NAV_ITEMS.find((i) => inSection(pathname, i.href));
  return item ? item.roles.includes(role) : true;
}

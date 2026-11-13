// The design system (FE1). Tokens, primitives and Ember components are exported from here.
// Import the styles once in the app: @import "@ember/ui/styles.css";

export const APP_NAME = "Ember";

export { cn } from "./lib/cn";
export { duration, easing, spring, reflow } from "./motion";
export { COLOR_NAMES, colors, colorUse, radii, typeScale, spacing } from "./tokens";
export type { ColorName, Theme } from "./tokens";
export { contrastRatio } from "./contrast";

export { Button, buttonVariants } from "./primitives/button";
export type { ButtonProps } from "./primitives/button";
export { Input, Textarea } from "./primitives/input";
export { Switch } from "./primitives/switch";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./primitives/tabs";
export { Segmented } from "./primitives/segmented";
export type { SegmentedOption } from "./primitives/segmented";
export {
  Tooltip,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogTitle,
  DialogDescription,
  DialogContent,
  SheetContent,
} from "./primitives/overlays";
export { Skeleton } from "./primitives/skeleton";

export { HeatIndicator, ReasonLine, SuggestedAction, HEAT_LABEL } from "./ember/attention";
export type { Heat } from "./ember/attention";
export { StreamedText } from "./ember/streaming";
export {
  SourceChip,
  AnswerCard,
  NotConfirmedCard,
  ObjectionCard,
  ContradictionAlert,
  NextQuestion,
} from "./ember/answers";
export type { Source, Feedback } from "./ember/answers";
export {
  ListeningIndicator,
  CallTimer,
  ShareStatus,
  ConsentStatus,
  TranscriptStream,
  formatDuration,
} from "./ember/call";
export type { TranscriptLine } from "./ember/call";
export {
  ExtractedField,
  DraftComposer,
  StageBadge,
  StatusPill,
  MetricTile,
  TrendChart,
  DemoBadge,
} from "./ember/data";
export type { DraftStatus, StatusTone } from "./ember/data";
export { EmptyState, ErrorState } from "./ember/states";
export { Surface, Rise, PageHeader, Aura } from "./ember/layout";
export { ReflowList, ReflowItem, SpringBoard, SpringTile } from "./ember/reflow";

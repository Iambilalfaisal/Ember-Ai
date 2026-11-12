// The live call panel and the LiveSession interface (FE5). Shared by the web demo and the Electron app.

export { LivePanel, LIVE_PANEL_MIN_WIDTH_PX } from "./panel/LivePanel";
export { MockLiveSession } from "./session/mock";
export type {
  LiveSession,
  PlaybackSnapshot,
  PlaybackSpeed,
  ScenarioControls,
  Verdict,
} from "./session/types";
export { liveReducer, initialLiveState, isMainCard } from "./state/reducer";
export type {
  LiveAction,
  LiveCard,
  LiveCardKind,
  LiveState,
  TranscriptEntry,
} from "./state/reducer";
export { useLiveSession } from "./state/useLiveSession";

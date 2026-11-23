import { create } from "zustand";

// Panel state that more than one component needs.
export type TourPath = "investor" | "morning" | "rescue";

type UiState = {
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** The guided tour: the step being shown, or null when the tour is closed. */
  tourStep: number | null;
  setTourStep: (step: number | null) => void;
  /** Which walkthrough the tour is showing: the full product story or one of the copilot paths. */
  tourPath: TourPath;
  startTour: (path: TourPath) => void;
};

export const useUi = create<UiState>()((set) => ({
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  tourStep: null,
  setTourStep: (tourStep) => set({ tourStep }),
  tourPath: "investor",
  startTour: (tourPath) => set({ tourPath, tourStep: 0 }),
}));

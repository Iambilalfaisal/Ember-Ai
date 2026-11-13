import { create } from "zustand";

// Panel state that more than one component needs.
type UiState = {
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** The guided tour: the step being shown, or null when the tour is closed. */
  tourStep: number | null;
  setTourStep: (step: number | null) => void;
};

export const useUi = create<UiState>()((set) => ({
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  tourStep: null,
  setTourStep: (tourStep) => set({ tourStep }),
}));

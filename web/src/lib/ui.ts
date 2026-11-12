import { create } from "zustand";

// Panel state that more than one component needs.
type UiState = {
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
};

export const useUi = create<UiState>()((set) => ({
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));

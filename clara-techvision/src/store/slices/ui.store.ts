"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface UIState {
  mobileNavOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;
  toggleMobileNav: () => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      mobileNavOpen: false,
      openMobileNav: () => set({ mobileNavOpen: true }),
      closeMobileNav: () => set({ mobileNavOpen: false }),
      toggleMobileNav: () => set((state) => ({ mobileNavOpen: !state.mobileNavOpen })),
    }),
    { name: "TechVisionUIStore" },
  ),
);

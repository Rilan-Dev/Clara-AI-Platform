"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface UIState {
  mobileNavOpen: boolean;
  userComposerOpen: boolean;
  toasts: ToastItem[];
  toggleMobileNav: () => void;
  closeMobileNav: () => void;
  openUserComposer: () => void;
  closeUserComposer: () => void;
  addToast: (toast: Omit<ToastItem, "id"> & { durationMs?: number }) => void;
  removeToast: (id: string) => void;
}

function createToastId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set, get) => ({
      mobileNavOpen: false,
      userComposerOpen: false,
      toasts: [],
      toggleMobileNav: () => set((state) => ({ mobileNavOpen: !state.mobileNavOpen })),
      closeMobileNav: () => set({ mobileNavOpen: false }),
      openUserComposer: () => set({ userComposerOpen: true }),
      closeUserComposer: () => set({ userComposerOpen: false }),
      addToast: ({ durationMs = 3800, ...toast }) => {
        const id = createToastId();
        set((state) => ({ toasts: [...state.toasts, { id, ...toast }] }));

        if (typeof window !== "undefined") {
          window.setTimeout(() => {
            get().removeToast(id);
          }, durationMs);
        }
      },
      removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
    }),
    { name: "UIStore" },
  ),
);

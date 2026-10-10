"use client";

import { create } from "zustand";

export type BootstrapUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  orgId: string | null;
};

export type ViewId =
  | "chat"
  | "dashboard"
  | "knowledge"
  | "billing"
  | "admin"
  | "validation";

type ClaraState = {
  activeUserId: string | null;
  view: ViewId;
  upgradeSheet: {
    open: boolean;
    code?: string;
    message?: string;
    plan?: string;
    planName?: string;
    reason?: string;
  };
  toast: { message: string; tone: "info" | "success" | "error" } | null;
  setActiveUser: (id: string | null) => void;
  setView: (v: ViewId) => void;
  openUpgradeSheet: (payload: {
    code?: string;
    message?: string;
    plan?: string;
    planName?: string;
    reason?: string;
  }) => void;
  closeUpgradeSheet: () => void;
  showToast: (message: string, tone?: "info" | "success" | "error") => void;
  clearToast: () => void;
};

export const useClara = create<ClaraState>((set) => ({
  activeUserId: null,
  view: "chat",
  upgradeSheet: { open: false },
  toast: null,
  setActiveUser: (id) => set({ activeUserId: id }),
  setView: (v) => set({ view: v }),
  openUpgradeSheet: (payload) =>
    set({ upgradeSheet: { open: true, ...payload } }),
  closeUpgradeSheet: () => set({ upgradeSheet: { open: false } }),
  showToast: (message, tone = "info") => set({ toast: { message, tone } }),
  clearToast: () => set({ toast: null }),
}));

/** Authed fetch helper — carries the demo identity header. */
export function api(
  path: string,
  userId: string | null,
  init?: RequestInit
): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(userId ? { "x-user-id": userId } : {}),
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
}

/** Parse the standard error envelope from a refused response. */
export async function readError(res: Response) {
  try {
    const body = await res.json();
    return body?.error ?? { code: "UNKNOWN", message: res.statusText };
  } catch {
    return { code: "UNKNOWN", message: res.statusText };
  }
}

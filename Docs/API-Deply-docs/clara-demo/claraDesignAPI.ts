/**
 * src/lib/clara/claraDesignAPI.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client utility for calling PATCH /api/embed/design.
 * Requires the API key to have design_edit_enabled = TRUE.
 * Only visual fields are accepted — AI behaviour is server-side only.
 */
import { CLARA_CONFIG, claraAuthHeader } from "./config";
import type { ClaraDesignConfig } from "./types";

export type DesignPatch = Partial<ClaraDesignConfig>;

export type DesignUpdateResult = {
  updated:       boolean;
  appliedFields: string[];
  rejectedFields?: string[];
  hint?:         string;
  design:        ClaraDesignConfig;
};

const DESIGN_API = `${CLARA_CONFIG.baseUrl}/api/embed/design`;
const CONFIG_API = `${CLARA_CONFIG.baseUrl}/api/embed/config`;

/** Read current design config from the server */
export async function getDesign(): Promise<ClaraDesignConfig> {
  const res = await fetch(DESIGN_API, { headers: claraAuthHeader() });
  if (!res.ok) throw new Error(`[ClaraDesign] GET failed: ${res.status}`);
  return res.json() as Promise<ClaraDesignConfig>;
}

/** Read public config (no design-edit permission required) */
export async function getConfig(): Promise<ClaraDesignConfig> {
  const res = await fetch(CONFIG_API, {
    headers: { "Authorization": `Bearer ${CLARA_CONFIG.apiKey}` },
  });
  if (!res.ok) throw new Error(`[ClaraConfig] GET failed: ${res.status}`);
  return res.json() as Promise<ClaraDesignConfig>;
}

/** Apply a partial design patch — changes are live immediately */
export async function updateDesign(patch: DesignPatch): Promise<DesignUpdateResult> {
  const res = await fetch(DESIGN_API, {
    method:  "PATCH",
    headers: claraAuthHeader(),
    body:    JSON.stringify(patch),
  });
  const data = await res.json() as DesignUpdateResult & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `[ClaraDesign] PATCH failed: ${res.status}`);
  // Reload the widget styles without page refresh
  window.ClaraWidget?.refreshDesign?.();
  return data;
}

/**
 * Preset helpers — call these directly for common transformations.
 * Each one sends exactly the fields it changes.
 */
export const ClaraPresets = {
  /** Switch to dark theme */
  darkMode: () => updateDesign({ widgetTheme: "dark" }),

  /** Switch to light theme */
  lightMode: () => updateDesign({ widgetTheme: "light" }),

  /** Apply a custom brand colour palette */
  brandColours: (primary: string, accent: string) =>
    updateDesign({ primaryColour: primary, accentColour: accent }),

  /** Move the widget to bottom-left */
  moveLeft: () => updateDesign({ widgetPosition: "bottom-left" }),

  /** Move the widget to bottom-right */
  moveRight: () => updateDesign({ widgetPosition: "bottom-right" }),

  /** Inject arbitrary CSS into the widget Shadow DOM */
  injectCSS: (css: string) => updateDesign({ customCss: css }),

  /** Replace the FAB launcher icon with a custom SVG */
  launcherIcon: (svg: string) => updateDesign({ customLauncherSvg: svg }),

  /** Switch to headless mode (zero DOM — use ClaraSDK) */
  headless: () => updateDesign({ widgetMode: "headless" }),

  /** Switch back to floating FAB mode */
  floating: () => updateDesign({ widgetMode: "floating" }),

  /** Update assistant identity */
  identity: (name: string, welcome: string, avatar?: string) =>
    updateDesign({ assistantName: name, welcomeMessage: welcome, ...(avatar ? { avatarUrl: avatar } : {}) }),

  /** Hide / show branding footer */
  hideBranding: () => updateDesign({ widgetShowBranding: false }),
  showBranding: (text?: string) =>
    updateDesign({ widgetShowBranding: true, ...(text ? { customPoweredBy: text } : {}) }),
};

/**
 * src/lib/clara/config.ts — Single source of truth for all Clara config.
 * Change the API key or base URL here; nothing else needs to change.
 */
export const CLARA_CONFIG = {
  /** Full API key. For production use: import.meta.env.VITE_CLARA_KEY */
  apiKey:    "clr_b9b4d8507e2981c048e4fca1f9d3ce2bf616e1c17bc5ad3b",
  baseUrl:   "https://clara-rag.amazetechclans.com",
  scriptUrl: "https://clara-rag.amazetechclans.com/embed/clara.js",
  iframeUrl: "https://clara-rag.amazetechclans.com/embed/widget",
} as const;

export const claraAuthHeader = () => ({
  "Authorization": `Bearer ${CLARA_CONFIG.apiKey}`,
  "Content-Type":  "application/json",
});

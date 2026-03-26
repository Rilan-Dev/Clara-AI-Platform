import { CLARA_API_KEY, API_BASE_URL, CLARA_SCRIPT_URL, CLARA_IFRAME_URL } from "@/lib/env";

export const CLARA_CONFIG = {
  apiKey:    CLARA_API_KEY,
  baseUrl:   API_BASE_URL,
  scriptUrl: CLARA_SCRIPT_URL,
  iframeUrl: CLARA_IFRAME_URL,
} as const;

export const claraAuthHeader = () => ({
  "Authorization": `Bearer ${CLARA_CONFIG.apiKey}`,
  "Content-Type":  "application/json",
});

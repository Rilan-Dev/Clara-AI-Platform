/**
 * src/lib/platform-env-client.ts
 * Browser-side save for platform environment settings (super admin).
 *
 * Two steps: POST { action: "token" } mints a short-lived HMAC confirmation
 * token, then POST { key, value, confirmation_token } persists the value.
 * The value only ever travels in request bodies — never in a URL, where it
 * would land in access logs, proxies and browser history.
 */

import { withAuthHeaders } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";

async function postEnv<T>(body: Record<string, unknown>): Promise<{ res: Response; data: T }> {
  const res = await fetch(apiUrl("/api/platform/env"), {
    method: "POST",
    headers: withAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { res, data };
}

export async function savePlatformEnvSetting(key: string, value: string): Promise<void> {
  const token = await postEnv<{ confirmation_token?: string; timestamp?: number; error?: string }>({
    action: "token",
    key,
    value,
  });
  if (!token.res.ok || !token.data.confirmation_token) {
    throw new Error(token.data.error ?? "Could not create confirmation token");
  }

  const saved = await postEnv<{ ok?: boolean; error?: string; message?: string }>({
    key,
    value,
    confirmation_token: token.data.confirmation_token,
    timestamp: token.data.timestamp,
  });
  if (!saved.res.ok) throw new Error(saved.data.message ?? saved.data.error ?? `Failed to save ${key}`);
}

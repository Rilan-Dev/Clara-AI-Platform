// ─── Platform-managed integration credentials ──────────────────────────────
//
// Server-side derivation of the credential fields a platform admin must fill
// in to "configure" an integration, plus the configured-state predicate used
// by the platform integrations API.
//
// Mirrors the doable-source control plane (integrations-admin.ts):
//   - oauth2 + requiresOAuthApp → configured when a platform OAuth app row exists
//   - secret_text / basic_auth / custom_auth → configured when a platform
//     credential row exists
//   - none (or oauth2 without requiresOAuthApp) → nothing to configure

import type { CustomAuthField, IntegrationDefinition } from "./types";

export const PLATFORM_CREDENTIAL_AUTH_TYPES = ["secret_text", "basic_auth", "custom_auth"] as const;
export type PlatformCredentialAuthType = (typeof PLATFORM_CREDENTIAL_AUTH_TYPES)[number];

/** Credential fields the platform admin must supply for non-OAuth integrations.
 *  Same derivation the organisation connect dialog uses, so the two surfaces
 *  can never ask for different shapes. */
export function platformCredentialFields(def: IntegrationDefinition): CustomAuthField[] {
  if (def.customAuthFields?.length) return def.customAuthFields;
  if (def.authType === "secret_text") {
    return [{ name: "api_key", displayName: "API key / access token", type: "secret", required: true }];
  }
  if (def.authType === "basic_auth") {
    return [
      { name: "username", displayName: "Username", type: "text", required: true },
      { name: "password", displayName: "Password", type: "secret", required: true },
    ];
  }
  return [];
}

/** True when the integration needs platform-managed credential storage
 *  (as opposed to a platform OAuth app or nothing at all). */
export function requiresPlatformCredentials(def: IntegrationDefinition): boolean {
  return def.authType === "secret_text" || def.authType === "basic_auth" || def.authType === "custom_auth";
}

/** True when the integration needs a platform OAuth app before it can be enabled. */
export function requiresPlatformOAuthApp(def: IntegrationDefinition): boolean {
  return def.authType === "oauth2" && def.requiresOAuthApp;
}

export type PlatformConfigState = {
  hasOAuthApp: boolean;
  hasCredentials: boolean;
};

/** Configured predicate — the gate the enable/disable toggle sits behind. */
export function isPlatformConfigured(def: IntegrationDefinition, state: PlatformConfigState): boolean {
  if (requiresPlatformOAuthApp(def)) return state.hasOAuthApp;
  if (requiresPlatformCredentials(def)) return state.hasCredentials;
  return true; // "none" and org-managed oauth2 need no platform configuration
}

/** Validate a submitted credential payload against the derived field list.
 *  Returns an error message or null when valid. Values are trimmed strings;
 *  secret values must be non-empty when required. */
export function validatePlatformCredentialInput(
  def: IntegrationDefinition,
  credentials: unknown,
): { error: string } | { values: Record<string, string> } {
  if (typeof credentials !== "object" || credentials === null || Array.isArray(credentials)) {
    return { error: "credentials object is required" };
  }
  const fields = platformCredentialFields(def);
  if (!fields.length) return { error: "This integration does not use platform-managed credentials" };

  const raw = credentials as Record<string, unknown>;
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const field of fields) {
    const value = raw[field.name];
    if (typeof value !== "string") {
      if (field.required) missing.push(field.displayName);
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed && field.required) {
      missing.push(field.displayName);
      continue;
    }
    if (trimmed.length > 8192) return { error: `${field.displayName} is too long` };
    values[field.name] = trimmed;
  }
  if (missing.length) return { error: `Complete the required fields: ${missing.join(", ")}` };
  if (!Object.keys(values).length) return { error: "No credential values were provided" };
  return { values };
}

import { createHash, randomBytes } from "node:crypto";

export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export interface CreatedOAuthState {
  /** Send this value only to the OAuth provider and the initiating browser. */
  state: string;
  /** Persist only this digest, never the raw state. */
  stateHash: string;
  /** Persist encrypted when PKCE is enabled; never expose it to the browser. */
  codeVerifier: string;
  codeChallenge: string;
  expiresAt: Date;
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function createOAuthState(now: Date = new Date()): CreatedOAuthState {
  // 256 bits of entropy; base64url avoids query-string escaping ambiguities.
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier, "ascii")
    .digest("base64url");

  return {
    state,
    stateHash: hashOAuthState(state),
    codeVerifier,
    codeChallenge,
    expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_SECONDS * 1000),
  };
}

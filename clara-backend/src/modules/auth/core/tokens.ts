/**
 * src/modules/auth/core/tokens.ts
 * Stateful session token management.
 *
 * Token lifecycle:
 *   1. generateToken()  → random 32-byte hex string sent to client
 *   2. hashToken()      → HMAC-SHA256 of the token stored in sessions.token_hash
 *   3. On each request: hash incoming token → look up in DB → get user
 *   4. Revoke: DELETE FROM sessions WHERE id = ?
 *
 * Storing only the hash in DB means a DB breach doesn't expose active tokens.
 */

import { randomBytes, createHmac } from "node:crypto";

const SESSION_SECRET = process.env.AUTH_SECRET ?? "insecure-default-change-me";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Generate a new random opaque session token (sent to client). */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** HMAC-SHA256 the token — this is what gets stored in the database. */
export function hashToken(token: string): string {
  return createHmac("sha256", SESSION_SECRET).update(token).digest("hex");
}

/** Calculate the session expiry timestamp from now. */
export function sessionExpiresAt(): Date {
  return new Date(Date.now() + SESSION_DURATION_MS);
}

/** Cookie name used for the session token. */
export const SESSION_COOKIE = "clara_session";

/** Build Set-Cookie header value. */
export function buildSetCookieHeader(token: string, expiresAt: Date): string {
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    `Max-Age=${maxAge}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/** Build Set-Cookie header that clears the session cookie. */
export function buildClearCookieHeader(): string {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
}

/**
 * Extract the session token from an incoming request.
 * Checks Authorization: Bearer <token> header first, then the cookie.
 */
export function extractToken(request: Request): string | null {
  // 1. Bearer token (for API clients)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  // 2. Cookie (for browser clients)
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key?.trim() === SESSION_COOKIE) {
      return rest.join("=").trim() || null;
    }
  }
  return null;
}

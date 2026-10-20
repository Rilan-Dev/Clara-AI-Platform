import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The phone bridge calls Next.js over HTTP, which can traverse a reverse
 * proxy on hosted deployments. Headers and localhost/X-Forwarded-For values
 * are caller-controlled and must never be treated as authentication.
 *
 * Prefer a dedicated PHONE_INTERNAL_SECRET. CRON_SECRET is an existing
 * server-only secret used as a compatibility fallback for deployed bridges.
 * Missing credentials fail closed; never expose either secret to clients.
 */
export function phoneInternalSecret(): string | null {
  const secret = process.env.PHONE_INTERNAL_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  return secret || null;
}

export function isAuthorizedPhoneInternal(headers: Headers): boolean {
  if (headers.get("x-phone-internal") !== "1") return false;

  const secret = phoneInternalSecret();
  const supplied = headers.get("x-phone-secret") ?? "";
  if (!secret || !supplied) return false;

  // Compare constant-length digests so caller-controlled header length cannot
  // affect timingSafeEqual's length requirement.
  const expectedHash = createHash("sha256").update(secret).digest();
  const providedHash = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedHash, providedHash);
}

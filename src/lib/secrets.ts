/**
 * Integration credential encryption secret.
 *
 * A dedicated key may be supplied with INTEGRATION_ENCRYPTION_KEY. AUTH_SECRET
 * is retained as a compatibility fallback so existing Clara deployments do
 * not break when upgrading to I-2. The value is only consumed server-side by
 * pgcrypto and must never be returned to clients or logged.
 */
const integrationEncryptionKey =
  process.env.INTEGRATION_ENCRYPTION_KEY?.trim() ||
  process.env.AUTH_SECRET?.trim() ||
  "";

if (process.env.NODE_ENV === "production" && integrationEncryptionKey.length < 32) {
  throw new Error(
    "[Clara AI] INTEGRATION_ENCRYPTION_KEY (or AUTH_SECRET fallback) must be at least 32 characters in production.",
  );
}

export const ENCRYPTION_KEY = integrationEncryptionKey;

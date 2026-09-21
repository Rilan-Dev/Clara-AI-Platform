-- ─────────────────────────────────────────────────────────────────────────────
-- 048_email_verification.sql
-- Clara AI Platform — email verification tokens for the signup flow.
--
-- Reuses the password_reset_tokens table (same security model: 32 random
-- bytes, only the HMAC-SHA256 hash is stored, single-use, expiring) with a
-- new 'email_verification' purpose:
--
--   * Sent right after registration (both user-only and org-level signup).
--   * Valid 24 hours; the latest link wins (resend invalidates older ones).
--   * Verifying marks users.email_verified = TRUE and triggers the welcome
--     email.
-- ─────────────────────────────────────────────────────────────────────────────

-- Widen the purpose CHECK constraint (026 created it inline; Postgres names
-- it <table>_<column>_check). Drop-if-exists keeps the migration safe on
-- databases where the constraint was already widened or dropped manually.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_tokens_purpose_check'
  ) THEN
    ALTER TABLE password_reset_tokens DROP CONSTRAINT password_reset_tokens_purpose_check;
  END IF;
END $$;

ALTER TABLE password_reset_tokens
  ADD CONSTRAINT password_reset_tokens_purpose_check
  CHECK (purpose IN ('password_reset', 'org_invitation', 'email_verification'));

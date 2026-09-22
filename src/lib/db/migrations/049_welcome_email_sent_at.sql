-- ─────────────────────────────────────────────────────────────────────────────
-- 049_welcome_email_sent_at.sql
-- Clara AI Platform — exactly-once welcome email for the signup funnel.
--
-- The welcome email used to fire only when the user clicked the verification
-- link. Users who never clicked (or whose link pointed at a mis-configured
-- origin) never received ANY onboarding mail. Per the product requirement
-- ("after a successful login, send a confirmation + welcome email"), the
-- welcome email now also fires on the first successful login.
--
-- users.welcome_email_sent_at:
--   * NULL            → the user has not been welcomed yet; the next
--                       successful login (or verification click) sends it.
--   * backfilled      → rows that existed BEFORE this migration are stamped
--                       with their created_at so existing users are NOT
--                       greeted with a surprise "Welcome!" email wave on
--                       their next login.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

-- Exactly-once claim helper used by sendWelcomeEmailOnce(): the atomic
-- "claim the send" update only matches while the column is NULL, so two
-- concurrent logins (or login racing the verification click) can never
-- both send. A partial index makes the claim cheap on the hot login path.
CREATE INDEX IF NOT EXISTS users_welcome_pending_idx
  ON users (id) WHERE welcome_email_sent_at IS NULL;

-- Backfill ONLY the rows that pre-date this migration (the column was just
-- added, so every existing row has NULL — stamp them as already welcomed).
UPDATE users
   SET welcome_email_sent_at = COALESCE(created_at, now())
 WHERE welcome_email_sent_at IS NULL;

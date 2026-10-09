# WhatsApp Business connection lifecycle

This implementation is server-side source for Meta WhatsApp Business Platform authorization, phone selection, webhook verification, and durable inbound message/delivery state. It is not a claim that a live Meta app has been configured or tested.

## Required server configuration

Configure these as server-side environment variables only:

- `META_APP_ID`: Meta app ID.
- `META_APP_SECRET`: Meta app secret. Never expose it to the browser.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: a high-entropy random value of at least 24 characters, shared with the Meta webhook configuration.
- `INTEGRATION_ENCRYPTION_KEY`: dedicated encryption key of at least 32 characters. The existing `AUTH_SECRET` fallback remains supported by `src/lib/secrets.ts`, but a dedicated key is preferred.
- `WHATSAPP_DAILY_BRIEFING_TEMPLATE_NAME`: name of an approved Meta WhatsApp template with exactly one body text parameter (`{{1}}`) for the briefing digest.
- `WHATSAPP_DAILY_BRIEFING_TEMPLATE_LANGUAGE`: the approved template language code; defaults to `en_US`.
- `NEXT_PUBLIC_APP_URL`: canonical public HTTPS origin, so the OAuth redirect URI remains stable behind proxies.

Do not commit values to the repository, place secrets in `NEXT_PUBLIC_*` variables, or paste them into project-control records.

## Meta app configuration

- Register the exact redirect URI `https://YOUR_PUBLIC_ORIGIN/api/whatsapp/oauth/callback` in the Meta app's OAuth redirect allowlist.
- Configure the WhatsApp Business Platform webhook callback URL as `https://YOUR_PUBLIC_ORIGIN/api/webhooks/whatsapp`.
- Use the exact same `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in Meta's webhook verification form.
- Subscribe the WhatsApp Business Account to the app and enable the `messages` webhook field so inbound messages and delivery statuses are sent.
- The app must be allowed to request `business_management`, `whatsapp_business_management`, and `whatsapp_business_messaging` for the account type being connected.

## Server lifecycle

1. An authenticated, agent-authorized POST creates a 10-minute, one-time state record bound to org, agent, user, and exact callback URI. Only the SHA-256 state digest is stored.
2. The callback consumes state atomically, exchanges the authorization code, attempts a long-lived token exchange, and discovers business/WABA phone candidates. Tokens are encrypted with PostgreSQL pgcrypto before persistence.
3. The authenticated agent owner selects a phone returned by that authorization. Unique indexes enforce one active phone per agent and prevent one active phone ID from being assigned to two agents.
4. Clara subscribes the selected WABA to the app. The public webhook GET validates Meta's challenge; POST verifies `X-Hub-Signature-256` over the exact raw request body before processing.
5. Webhook event keys and provider message IDs are unique. Inbound messages and delivery-status transitions are persisted transactionally; retries do not create duplicate event/message rows.
6. Messaging status and webhook health come from server state. Daily briefing eligibility cannot be enabled unless the active connection has received a valid signed webhook event. Disconnect clears the briefing flag.

## Scheduled daily briefing worker

- `src/app/api/cron/whatsapp-daily-briefings/route.ts` is registered in `vercel.json` for **03:00 UTC daily**. Self-hosted `local-cron` reads the same schedule from `vercel.json` and requires `CRON_SECRET`.
- The job selects only active connections with `webhook_verified=true`, `daily_briefing_enabled=true`, a recipient number, and a recorded opt-in. It rechecks the gate immediately before sending.
- Configure an approved Meta template named by `WHATSAPP_DAILY_BRIEFING_TEMPLATE_NAME` whose body contains one text parameter `{{1}}`. The worker sends a deterministic digest of inbound message excerpts from the previous 24 hours as that template parameter; it is not yet an LLM-generated conversation summary.
- `whatsapp_daily_briefing_runs` records the unique connection/date run and result. Outbound provider message IDs and statuses are persisted in `whatsapp_messages`; signed Meta status webhooks update delivery state. Ambiguous network/persistence outcomes are left in `sending` with an error code rather than retried automatically, to avoid duplicate sends.

## Current boundaries / follow-up

- The scheduled sender is source-implemented, but no actual scheduled run, provider send, or delivery has been verified. An enabled preference is not proof that a message was delivered.
- When Meta returns `expires_in`, the token expiry is persisted and expired connections are marked unhealthy with briefing eligibility disabled. Revocation/permission-health probes and reconnect scheduling remain follow-up work; a missing provider expiry value remains unknown.
- No live Meta OAuth consent, webhook challenge, WABA subscription, runtime, build, or test execution is claimed. Regression source exists for webhook signature/idempotency and briefing helpers; run normal verification when next appropriate without blocking independent development.

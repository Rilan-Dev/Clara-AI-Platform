# Clara AI — Vercel + VPS + Cloud deployment

Deployment contract:
- Vite-Converted = development / Vercel Preview.
- Vercel-Prod = production / Vercel Production.
- Existing VPS Docker deployment remains active and unchanged.
- clara.rag.amazetechclans.com = Vercel production web/API (live since 2026-09-22).
- clara.ai.amazetechclans.com = existing VPS portal + realtime WebSocket endpoint (voice WS is same-origin: wss://<host>/api/voice/...).
- NEVER use the legacy hyphenated name `clara-rag.amazetechclans.com` — it has no DNS record (NXDOMAIN) and is not a valid platform hostname. Valid hostnames are only `clara.rag.amazetechclans.com` (Vercel) and `clara.ai.amazetechclans.com` (VPS).
- Supabase = PostgreSQL.
- Upstash = Redis/BullMQ.
- Qdrant Cloud = vector database.
- CloudAMQP = RabbitMQ.

Vercel must run the normal Next.js build. Do not run scripts/start.mjs on Vercel; the repository custom server owns long-lived voice/phone WebSockets on the VPS.

Required Vercel variables:

    NEXT_PUBLIC_APP_URL=https://clara.rag.amazetechclans.com
    NEXT_PUBLIC_API_BASE_URL=
    # Voice WS base for Vercel-served pages -> VPS. (Currently unused by code:
    # the client builds the voice WS URL from the page origin, so Vercel pages
    # talk to the Vercel origin; long-lived WS sessions are owned by the VPS.)
    NEXT_PUBLIC_VOICE_WS_BASE_URL=https://clara.ai.amazetechclans.com

Server variables must contain the Supabase DATABASE_URL, Qdrant URL/key, Upstash Redis connection, CloudAMQP RABBITMQ_URL, and existing AI/auth secrets. Keep secrets out of NEXT_PUBLIC_*.

DNS:
    clara.rag.amazetechclans.com -> CNAME 182fb57ad884a70d.vercel-dns-017.com -> Vercel
    clara.ai.amazetechclans.com -> A 180.188.231.138 -> VPS

Worker recommendation: keep the current VPS worker initially. If a free separate worker is required, test OCI Always Free Ampere A1 first; the current worker uses Playwright, so ARM compatibility must be verified before migration.

Production validation: Vercel Preview from Vite-Converted, then Production from Vercel-Prod; verify Supabase, Qdrant, Redis, RabbitMQ, worker jobs, and VPS WebSockets independently.

Preview deployments (Hobby plan): Vercel blocks any preview deployment whose commit author cannot be resolved to an account with contributing access ("Deployment was blocked" on the GitHub status, red Vercel check, no build starts). On the Hobby plan only the account owner qualifies. Commits pushed to preview branches MUST therefore be authored as the owner identity `RiluRaafu <65199603+Rilan-Dev@users.noreply.github.com>` (the GitHub noreply email reliably maps to the account). A plain personal email that is not verified against the GitHub account will NOT pass the check. Production deployments are exempt from this rule.

Security: the Vercel token supplied during setup has been exposed in chat and should be rotated. Never commit it.
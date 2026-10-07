# Clara AI — Vercel + VPS + Cloud deployment

> **Current owner deployment policy (2026-10-07):** Git-triggered Vercel deployments are disabled. Deploy Clara to Vercel manually from the linked local checkout/CLI. GitHub Actions is also manual-only (`workflow_dispatch`). Self-hosted Docker deployments must use `bash scripts/vps-deploy.sh`, which serializes image builds and the Compose file applies explicit runtime resource ceilings.

Deployment contract:
- Vite-Converted = development / Vercel Preview.
- Vercel-Prod = production / Vercel Production.
- Existing VPS Docker deployment remains active and unchanged.
- clara.rag.amazetechclans.com = Vercel production web/API (live since 2026-09-22).
- preview.rag.amazetechclans.com = Vercel PREVIEW branch domain, assigned to Git branch `Vercel-Preview`. It always serves the branch's most recent deployment — the stable preview URL (set up 2026-09-23).
- clara.ai.amazetechclans.com = existing VPS portal + realtime WebSocket endpoint (voice WS is same-origin: wss://<host>/api/voice/...).
- NEVER use the legacy hyphenated name `clara-rag.amazetechclans.com` — it has no DNS record (NXDOMAIN) and is not a valid platform hostname. Valid hostnames are only `clara.rag.amazetechclans.com` (Vercel production), `preview.rag.amazetechclans.com` (Vercel preview) and `clara.ai.amazetechclans.com` (VPS).
- Supabase = PostgreSQL.
- Upstash = Redis/BullMQ.
- Qdrant Cloud = vector database.
- CloudAMQP = RabbitMQ.

Vercel must run the normal Next.js build. Git pushes are not a deployment mechanism for Clara while manual-only mode is active. Do not run scripts/start.mjs on Vercel; the repository custom server owns long-lived voice/phone WebSockets on the VPS.

Required Vercel variables:

    NEXT_PUBLIC_APP_URL=https://clara.rag.amazetechclans.com
    NEXT_PUBLIC_API_BASE_URL=
    # Voice WS base for Vercel-served pages -> VPS. (Currently unused by code:
    # the client builds the voice WS URL from the page origin, so Vercel pages
    # talk to the Vercel origin; long-lived WS sessions are owned by the VPS.)
    NEXT_PUBLIC_VOICE_WS_BASE_URL=https://clara.ai.amazetechclans.com

NEXT_PUBLIC_API_BASE_URL must stay EMPTY (or scoped to the Production environment only). It is baked into every build at compile time; if the production URL leaks into preview builds, preview pages try to call the production API cross-origin and the static CSP (`connect-src 'self' …`) blocks every request — the console shows `Connecting to 'https://clara.rag…/api/auth/me' violates Content Security Policy`. The client now also enforces this defensively: `getApiBaseUrl()` in `src/lib/runtime.ts` falls back to same-origin relative URLs whenever the page hostname differs from the configured base hostname, so preview deployments are always self-contained even if the variable is mis-scoped.

Server variables must contain the Supabase DATABASE_URL, Qdrant URL/key, Upstash Redis connection, CloudAMQP RABBITMQ_URL, and existing AI/auth secrets. Keep secrets out of NEXT_PUBLIC_*.

DNS:
    clara.rag.amazetechclans.com -> CNAME 182fb57ad884a70d.vercel-dns-017.com -> Vercel
    preview.rag.amazetechclans.com -> CNAME <value shown by Vercel when the domain is added> -> Vercel
    clara.ai.amazetechclans.com -> A 180.188.231.138 -> VPS

Assigning the preview branch domain (one-time): Vercel dashboard → project `clara-backend` → Settings → Domains → Add `preview.rag.amazetechclans.com` → assign it to the Git branch `Vercel-Preview` (NOT a redirect, NOT production). Add the DNS CNAME Vercel displays at the amazetechclans.com DNS provider. From then on every new deployment built from `Vercel-Preview` is automatically served at https://preview.rag.amazetechclans.com. Note: the free `<project>-git-<branch>.vercel.app` alias is NOT available for this project — `clara-backend.vercel.app` is occupied by a legacy placeholder project (it serves an 11-byte Express response), so the custom branch domain is the platform's static preview URL.

Worker recommendation: keep the current VPS worker initially. If a free separate worker is required, test OCI Always Free Ampere A1 first; the current worker uses Playwright, so ARM compatibility must be verified before migration.

Production validation: Vercel Preview from Vite-Converted, then Production from Vercel-Prod; verify Supabase, Qdrant, Redis, RabbitMQ, worker jobs, and VPS WebSockets independently.

Preview deployments (Hobby plan): Vercel blocks any preview deployment whose commit author cannot be resolved to an account with contributing access ("Deployment was blocked" on the GitHub status, red Vercel check, no build starts). On the Hobby plan only the account owner qualifies. Commits pushed to preview branches MUST therefore be authored as the owner identity `RiluRaafu <65199603+Rilan-Dev@users.noreply.github.com>` (the GitHub noreply email reliably maps to the account). A plain personal email that is not verified against the GitHub account will NOT pass the check. Production deployments are exempt from this rule.

Security: the Vercel token supplied during setup has been exposed in chat and should be rotated. Never commit it.

CSP notes for previews: `https://vercel.live` is allowed in `script-src` and `connect-src` because Vercel injects its first-party toolbar/feedback script into preview deployments; without the allowance every preview build logs CSP violations. The toolbar only renders for viewers authenticated to the Vercel account, so it does not interfere with anonymous access or browser automation against the preview branch domain. If the toolbar overlay is ever unwanted for automated flows, disable “Vercel Toolbar” in the project's Settings instead of removing the CSP allowance.
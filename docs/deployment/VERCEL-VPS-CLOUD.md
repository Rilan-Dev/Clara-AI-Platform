# Clara AI — Vercel + VPS + Cloud deployment

Deployment contract:
- Vite-Converted = development / Vercel Preview.
- Vercel-Prod = production / Vercel Production.
- Existing VPS Docker deployment remains active and unchanged.
- clara-rag.amazetechclans.com = Vercel production web/API.
- voice.clara-rag.amazetechclans.com = existing VPS realtime WebSocket endpoint.
- Supabase = PostgreSQL.
- Upstash = Redis/BullMQ.
- Qdrant Cloud = vector database.
- CloudAMQP = RabbitMQ.

Vercel must run the normal Next.js build. Do not run scripts/start.mjs on Vercel; the repository custom server owns long-lived voice/phone WebSockets on the VPS.

Required Vercel variables:

    NEXT_PUBLIC_APP_URL=https://clara-rag.amazetechclans.com
    NEXT_PUBLIC_API_BASE_URL=
    NEXT_PUBLIC_VOICE_WS_BASE_URL=https://voice.clara-rag.amazetechclans.com

Server variables must contain the Supabase DATABASE_URL, Qdrant URL/key, Upstash Redis connection, CloudAMQP RABBITMQ_URL, and existing AI/auth secrets. Keep secrets out of NEXT_PUBLIC_*.

DNS:
    clara-rag.amazetechclans.com -> Vercel
    voice.clara-rag.amazetechclans.com -> VPS

Worker recommendation: keep the current VPS worker initially. If a free separate worker is required, test OCI Always Free Ampere A1 first; the current worker uses Playwright, so ARM compatibility must be verified before migration.

Production validation: Vercel Preview from Vite-Converted, then Production from Vercel-Prod; verify Supabase, Qdrant, Redis, RabbitMQ, worker jobs, and VPS WebSockets independently.

Security: the Vercel token supplied during setup has been exposed in chat and should be rotated. Never commit it.
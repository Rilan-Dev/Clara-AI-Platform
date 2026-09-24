# Clara AI Platform

Clara is a multi-tenant platform for building AI assistants on top of your own documents. Organisations create **agents**, attach **knowledge bases** (uploaded files and crawled websites), tune the assistant's persona and models, and publish it as a website chat widget, a hosted public page, a realtime voice agent or a phone line.

Built with Next.js 15, TypeScript, Tailwind, PostgreSQL and Qdrant. Chat and voice run on OpenAI, Gemini, Sarvam and ElevenLabs, configured by the platform admin.

## What's in the product

| Area | Where | What it does |
|------|-------|--------------|
| Agent workspace | `/orgs/:orgId/agents/:agentId` | Overview, agent persona and AI settings, FAQ, knowledge, capabilities, branches/versions, publish |
| Knowledge bases | Agent → Knowledge → a knowledge base | Upload documents, crawl websites, analytics, **Embed & API keys** (with usage), **Widget design**, **Phone** |
| Organisation | Sidebar → Settings → Organisation | Profile, logo, ElevenLabs Conversational AI agents |
| Platform admin | `/dashboard`, `/subscriptions`, `/analytics`, `/system-status`, `/settings/*` | Plans and billing, Q&A audit trail (PII redacted, audited reveal), service health and runtime configuration, AI providers, payments, email |
| Public site | `/`, `/features`, `/pricing`, `/contact`, `/docs` | Marketing pages, signup and checkout |
| Embeds | `/embed/widget`, `/embed/voice`, `public/embed/clara.js` | The widget and voice surfaces customers put on their own sites |

## Getting started

Prerequisites: Node.js 22, PostgreSQL, a Qdrant instance and at least one AI provider key.

```bash
cp .env.example .env      # fill in DATABASE_URL, QDRANT_URL, AUTH_SECRET, provider keys
npm install
npm run db:migrate
npm run seed:dev          # optional demo organisations, agents and documents
npm run dev               # http://localhost:3000
```

Key environment variables (see `.env.example` for the full, commented list):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (the only database setting) |
| `AUTH_SECRET` | Session signing secret, at least 32 characters |
| `QDRANT_URL`, `QDRANT_API_KEY` | Vector store |
| `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `SARVAM_API_KEY` | AI providers (enable/disable them in Settings → AI Platform) |
| `CLARA_SUPPORT_EMAIL` | Inbox for contact-form leads and billing reviews |
| `PLAN_GUARD_FAIL_MODE` | `closed` refuses requests when plan limits can't be verified (default `open`) |

Many runtime switches are env-only; the platform admin can see their effective values under **System status → Runtime configuration**.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript (CI runs `npx tsc --noEmit`) |
| `npm test` | Vitest (use `npm test -- --run` for a single pass) |
| `npm run db:migrate` | Apply database migrations |
| `npm run seed:dev` / `seed:reset` / `seed:clean` | Demo data |
| `npm run ingest <file> "<title>" [source]` | Ingest a file from the CLI |
| `npm run ingest-web <url> "<title>"` | Ingest a web page from the CLI |

## Documentation

| Guide | Audience |
|-------|----------|
| [Setup](./Doc/18-09-2026/SETUP.md) | Developers — local setup, tests, troubleshooting |
| [Deployment](./Doc/18-09-2026/DEPLOYMENT.md) · [Docker/TLS](./Doc/18-09-2026/DEPLOY.md) · [Vercel](./docs/deployment/VERCEL-VPS-CLOUD.md) | Operators |
| [API reference](./Doc/18-09-2026/API.md) | Developers — REST endpoints |
| [Seeding](./Doc/18-09-2026/SEED.md) | Developers — demo data layers |
| [Tenant guide](./Doc/18-09-2026/TENANT-GUIDE.md) | Customers — using the workspace |
| [Embed guide](./Doc/18-09-2026/EMBED-GUIDE.md) | Customers — adding the widget to a website |
| [RabbitMQ](./Doc/18-09-2026/DEPLOY_RABBITMQ.md) | Operators — event bridge and DLQ |
| [ElevenLabs](./Doc/19-09-2026/ELEVENLABS_INTEGRATION.md) · [Sarvam AI](./Doc/19-09-2026/SARVAM_AI_INTEGRATION.md) | Operators — voice and language providers |

## Contributing

Before pushing, run `npm run lint`, `npx tsc --noEmit` and `npm test -- --run`. CI runs the same checks on `main`, `Vite-Converted` and `Vercel-Prod`; keep them green.

## License

Proprietary — for internal use.

# Clara Knowledge Assistant

Clara is a Next.js + Tailwind application that layers Retrieval Augmented Generation (RAG) on top of your private documents. Each document you ingest is embedded with OpenAI, stored in its own Qdrant collection, and catalogued for quick selection before every chat session.

## Documentation

| Guide | Audience |
|-------|----------|
| [SETUP.md](./SETUP.md) | Developers — full local setup, tests, troubleshooting |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Ops — self-host & cloud deployment, env matrix, day-2 runbook |
| [API.md](./API.md) | Developers — REST reference for every endpoint |
| [SEED.md](./SEED.md) | Developers — demo data layers, seeding & reset semantics |
| [TENANT-GUIDE.md](./TENANT-GUIDE.md) | Clients — using the tenant workspace portal |
| [EMBED-GUIDE.md](./EMBED-GUIDE.md) | Clients — embedding the Clara widget on any website |
| [DEPLOY.md](./DEPLOY.md) | Docker/TLS specifics · [DEPLOY_RABBITMQ.md](./DEPLOY_RABBITMQ.md) · [Doc/](./Doc/) architecture notes |
| [Doc/ELEVENLABS_INTEGRATION.md](./Doc/ELEVENLABS_INTEGRATION.md) | Ops — ElevenLabs voice integration runbook: env vars, flags, Mode A/B enablement, alerting, kill switches |
| [Doc/SARVAM_AI_INTEGRATION.md](./Doc/SARVAM_AI_INTEGRATION.md) | Ops — Sarvam AI integration runbook: Indic brain/voice/language services, cross-lingual RAG, realtime STT relay, env vars, kill switches |

## Features

- **Streaming chat UI** – token-by-token responses, inline citations, and quick prompts.
- **Per-document isolation** – every upload lives in a dedicated Qdrant collection; Clara only queries the source you pick.
- **Ingestion workspace** – upload PDFs, Office documents, spreadsheets, markdown, HTML, JSON, or fetch a live URL with automatic chunking.
- **CLI tooling** – 
pm run ingest and 
pm run ingest-web to script bulk imports.
- **Dynamic PDF fallback** – uses pdf-parse when available and falls back to pdfjs-dist (no worker required) to handle complex PDFs server-side.

## Prerequisites

- Node.js 18+ (Next.js 15 requires the active LTS or later).
- npm 9+ (or pnpm/yarn if you adjust the scripts).
- Access to an OpenAI account with the chat and embedding models you configure.
- A running Qdrant instance (local Docker, managed service, or cloud provider).

## Environment variables

Create an .env file (one is generated in this repository) and provide:

`ini
OPENAI_API_KEY="sk-..."
QDRANT_URL="http://localhost:6333"
QDRANT_API_KEY=""        # optional
# OPENAI_CHAT_MODEL="gpt-4o-mini"
# OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
# OPENAI_EMBEDDING_DIMENSION="1536"
# QDRANT_CATALOG_COLLECTION="document_catalog"
`

The defaults expect the lightweight document_catalog collection for metadata. You do **not** need to set a shared QDRANT_COLLECTION; Clara creates a new collection per upload automatically.

## Install & run

`ash
npm install
npm run dev
`

Navigate to <http://localhost:3000>. The landing page lists your documents and lets you choose one prior to chatting. The /ingest route exposes the drag-and-drop workspace for new uploads.

### Production build

`ash
npm run build
npm start
`

## Document ingestion options

### In-app workspace

1. Visit /ingest.
2. Upload a file **or** provide a Source URL (leave the file blank for URL-only ingestion).
3. Watch the staged pipeline (Transfer → Extract → Embed → Sync) for progress.
4. On success, the document appears in the catalog for future chats.

Accepted formats: .pdf, .docx, .xlsx, .xls, .xlsm, .csv, .md, .txt, .html, .htm, .json. PDFs use pdf-parse first, falling back to pdfjs-dist with workers disabled.

### CLI scripts

`ash
# File ingestion
npm run ingest ./docs/policies.pdf "Policy Handbook" "https://intranet/policies"

# URL ingestion
npm run ingest-web https://example.com/insights/latest "Example Insights"
`

Both scripts chunk the content, call the embedding API, and register the new document in Qdrant’s catalog alongside its dedicated collection name.

## Qdrant layout

- document_catalog (configurable): stores metadata for each ingested document (title, source, created timestamps).
- collection_<slug>_<uuid>: one per upload, containing the actual embedded chunks.

During chat, Clara loads the catalog, you choose a document, and only that collection is queried for context.

## Troubleshooting

- **401 Unauthorized (OpenAI)** – confirm OPENAI_API_KEY and model access.
- **ECONNREFUSED (Qdrant)** – verify QDRANT_URL points to a reachable instance.
- **PDF ingestion fails** – ensure pdf-parse can read the file. The fallback requires pdfjs-dist (already a dependency) and disables workers automatically, so no additional build config is needed.
- **No documents listed** – refresh the catalog via the sidebar button or check the ingestion logs for errors.

## Useful scripts

- 
pm run lint – run ESLint.
- 
pm run dev – start Next.js with Turbopack.
- 
pm run ingest / 
pm run ingest-web – manual ingestion helpers described above.

## License

This project is provided for internal use. Adapt or extend as needed for your organization’s knowledge workflows.


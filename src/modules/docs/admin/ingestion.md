# Document Ingestion Guide

Clara’s ingestion flow is implemented with reusable helpers in `src/modules/admin/core`. This document explains how to use them in HTTP routes, CLI scripts, or background jobs.

## Key Building Blocks

```ts
import {
  chunkText,
  loadFileAsText,
  parseDocumentFromBuffer,
  loadWebPage,
  generateCollectionName,
  addDocumentRecord,
  ensureCollectionExists,
  upsertDocuments,
  type DocumentChunk,
} from "@/modules/admin/core";
```

- **loadFileAsText / parseDocumentFromBuffer** – Extract text + metadata from PDFs, DOCX, XLSX, CSV, Markdown, etc.
- **loadWebPage** – Fetch and extract web content for ingestion.
- **chunkText** – Breaks large bodies of text into overlapping segments suited for embeddings.
- **generateCollectionName** – Creates a unique, slugified Qdrant collection name.
- **ensureCollectionExists / upsertDocuments** – Work with Qdrant safely.
- **addDocumentRecord** – Stores metadata in the catalog collection for discovery.

## Ingest API Workflow

The Next.js route at `src/app/api/ingest/route.ts` demonstrates the typical pattern:

1. Accept a file upload or source URL.
2. Extract plain text (`loadFileAsText`, `parseDocumentFromBuffer`, or `loadWebPage`).
3. Split text into chunks (`chunkText`).
4. Generate a collection name (`generateCollectionName`).
5. Ensure the collection exists (`ensureCollectionExists`).
6. Embed and upsert chunks (`upsertDocuments`).
7. Record catalog metadata (`addDocumentRecord`).

You can adapt this pipeline to background jobs by replacing the API-boundary logic with your own queue or worker.

## CLI Scripts

Two scripts are included to ingest content without the UI:

- `scripts/ingest.ts <path> [title] [url]`
- `scripts/ingest-web.ts <url> [title]`

Both now consume the same admin core exports, so they continue to work even though the helpers were relocated.

### Example: ingesting a local PDF

```bash
npm run ingest ./docs/policies/health.pdf "Health Shield Policy"
```

### Example: ingesting a URL

```bash
npm run ingest-web https://example.com/insurance/plan -- "Insurance Plan Overview"
```

## UI Harness

`AdminIngestWorkspace` (under `src/modules/admin/ui`) is a client component you can mount wherever you want administrators to manage sources. It talks to `/api/ingest` and displays animated progress states. Because it lives outside the assistant package, you can remove it from production builds while leaving the assistant operational.

```tsx
"use client";

import { AdminIngestWorkspace } from "@/modules/admin/ui";

export default function ProtectedIngestionScreen() {
  // Wrap in auth/feature checks as needed.
  return <AdminIngestWorkspace />;
}
```

## Security Suggestions

- Gate ingestion routes and pages behind authentication/authorization checks. Nothing in the admin module assumes public access.
- Rotate `QDRANT_API_KEY` and ensure the key is scoped appropriately.
- Keep ingestion background jobs separate from the assistant runtime if you need additional isolation.

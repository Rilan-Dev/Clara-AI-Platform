# Admin Modules

Administrative utilities for document ingestion and vector-store management live under `src/modules/admin`. They are intentionally separated so you can deploy the chatbot without exposing ingestion logic to downstream consumers.

## Structure

| Path | Description |
| --- | --- |
| `src/modules/admin/core` | Headless APIs for catalog, Qdrant vector management, and ingestion helpers. |
| `src/modules/admin/ui` | Optional React UIs for managing documents (e.g. the ingestion workspace). |

Core exports include:

```ts
import {
  listDocuments,
  getDocumentById,
  addDocumentRecord,
  generateCollectionName,
  ensureCollectionExists,
  upsertDocuments,
  chunkText,
  parseDocumentFromBuffer,
  loadWebPage,
  loadFileAsText,
  embedQuery,
  searchSimilarDocuments,
} from "@/modules/admin/core";
```

The admin UI layer currently exposes:

```ts
import { AdminIngestWorkspace } from "@/modules/admin/ui";
```

## Typical Server Usage

```ts
// app/api/documents/route.ts
import { NextResponse } from "next/server";
import { listDocuments } from "@/modules/admin/core";

export async function GET() {
  const documents = await listDocuments();
  return NextResponse.json({ documents });
}
```

```ts
// app/api/rag/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getDocumentById,
  embedQuery,
  searchSimilarDocuments,
} from "@/modules/admin/core";

export async function POST(request: NextRequest) {
  const { documentId, query } = await request.json();
  const record = await getDocumentById(documentId);
  const embedding = await embedQuery(query);
  const hits = await searchSimilarDocuments(record.collectionName, embedding, 4);
  return NextResponse.json({ sources: hits });
}
```

## Bundling the Admin UI

The ingestion workspace used at `/ingest` simply re-exports the admin UI component:

```tsx
// app/ingest/page.tsx
"use client";

import { AdminIngestWorkspace } from "@/modules/admin/ui";

export default function IngestPage() {
  return <AdminIngestWorkspace />;
}
```

Feel free to mount this behind auth or feature flags, or replace it with your own UI while continuing to use the core ingestion helpers.

See `docs/admin/ingestion.md` for the ingestion pipeline and CLI tooling.

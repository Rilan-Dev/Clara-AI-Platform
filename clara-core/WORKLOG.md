
## 2026-10-03 — Published chat transport dependency slice

### Completed
- Continued tracing the published-agent chat execution path in src/app/api/embed/chat/route.ts.
- Confirmed the route itself is not a clean reusable core boundary: it combines embed authentication, publication/feature gating, tenant-owned KB persistence, quota admission, analytics, provider resolution, HTTP/CORS handling, request aborts, secrets, and NDJSON streaming.
- Extracted the direct reusable transport primitive used by the published chat route:
  - src/modules/embed/core/ndjson.ts
- The extracted primitive provides the Clara NDJSON event contract, encoder, and incremental tolerant parser used by embed chat streams.

### Verified source identity
- src/modules/embed/core/ndjson.ts → be41ac5b9306c61415069d789ff0bf7e1e55a0da
- Target was created byte-for-byte from the Clara source in commit a07c531dd0a3f7ebf5672cdfe2dc522f59f8bcc2.
- Manifest registration committed in fb327eea639357ac493b69e365dd03f8c22cfaae.
- Manifest count increased from 93 to 94 immutable source entries.

### Boundary conclusion
No additional standalone published-agent chat orchestrator was found that can be safely extracted without inventing a new abstraction or dragging host concerns into Clara Core. The existing route remains the application adapter around already-extracted Clara primitives: AI provider resolution/factory, RAG grounding, KB configuration, query metering/quota admission, conversation context, and embed retrieval/NDJSON transport.

### Not completed
- Full 94-entry immutable verifier still needs execution from a repository checkout.
- Public deployment/configuration routes remain adapters; published deployment resolution is already represented by extracted ai-core resolution/versioning mechanics.
- Generic MCP/tool runtime still has no standalone Clara implementation to extract.

### Next
Continue from the remaining published-agent runtime dependencies, prioritizing public session/configuration state and any provider-neutral session lifecycle primitive that exists below the HTTP routes. Do not invent a chat runtime merely to force an extraction.

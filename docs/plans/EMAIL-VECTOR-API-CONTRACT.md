# Clara Email Vector API Contract

Status: implementation branch feature/email-vector-api; not production-enabled.

## Purpose

Provide a supported server-to-server contract for the ai-comms-agent email indexer/outbox to store, update, search, and delete derived email vectors in Clara-managed Qdrant. Email points are not stored in a Knowledge Base collection.

## Endpoint and authentication

- Method/path: POST /api/internal/email-vectors
- Authentication: Authorization: Bearer <CLARA_EMAIL_VECTOR_API_KEY>
- Configure CLARA_EMAIL_VECTOR_API_KEY as a random secret of at least 32 characters in Clara and configure the identical secret only in the trusted ai-comms-agent server runtime.
- Missing server secret fails closed with HTTP 503. Missing/incorrect bearer credentials return HTTP 401.
- Request size is capped at 2 MB. Responses disable caching. The endpoint does not accept browser-cookie authentication and does not implement CORS.
- Do not expose the credential to browser/client code or logs.

The service credential identifies the trusted caller; it does not independently prove an end-user's mailbox grants. The caller must resolve organization and account authorization before every operation. In particular, search requires an explicit, non-empty allowedAccountIds list; wildcards and empty lists are rejected. Do not connect Chat or realtime voice to this API until the active agent-to-account authorization defect ISS-026 is closed by FIX-01.

## Operations

All operations are JSON POST requests with an action property.

### Upsert/reindex one message

~~~json
{
  "action": "upsert",
  "metadata": {
    "orgId": "org-id",
    "accountId": "mail-account-id",
    "messageId": "provider-message-id",
    "sourceId": "stable-source-id",
    "receivedAt": "2026-10-16T10:00:00.000Z",
    "sender": "sender@example.com",
    "subject": "Invoice",
    "labels": ["INBOX"]
  },
  "chunks": [
    { "chunkIndex": 0, "sourceId": "stable-source-id", "text": "Email body chunk..." }
  ]
}
~~~

Point IDs are deterministic for orgId + accountId + messageId + chunkIndex. Upsert uses the tenant's resolved embedding configuration and a dedicated model-specific email collection. It upserts current chunks then deletes stale chunk indices for the same organization/account/message. An empty chunk list deletes all vectors for that message. The response reports upserted and staleCleanupApplied; it does not claim a server-reported exact stale-point count.

### Semantic search

~~~json
{
  "action": "search",
  "orgId": "org-id",
  "allowedAccountIds": ["mail-account-id-1", "mail-account-id-2"],
  "query": "invoice from last week",
  "limit": 8
}
~~~

The Qdrant query filter requires both orgId and an account ID in allowedAccountIds. Results are checked again in application code before being returned. Each hit includes its point ID, score, chunk text, account/message/source IDs, received timestamp, and available sender/subject/labels. This is semantic candidate retrieval, not authoritative date filtering, exact counts, or proof that every matching message was indexed; PostgreSQL remains authoritative for those tasks.

### Metadata-only update

~~~json
{
  "action": "update_metadata",
  "orgId": "org-id",
  "accountId": "mail-account-id",
  "messageId": "provider-message-id",
  "metadata": { "subject": "Updated subject", "labels": ["INBOX", "STARRED"] }
}
~~~

Supported fields: sender, subject, labels, receivedAt, sourceId. The operation does not re-embed email content.

### Delete and purge

- delete_message: requires orgId, accountId, messageId.
- purge_account: requires orgId, accountId.
- purge_org: requires orgId; reserved for a trusted server workflow and must only be called after independently confirming the organization's deletion/retention policy.

All delete filters include the organization, and message/account operations include the account ID.

## Implementation notes and rollout gates

- Vector payloads carry organization and account IDs; these are mandatory filters for search.
- Collections are separated from KB collections and keyed by resolved embedding provider/model/dimension.
- Embedding provider resolution, Qdrant connectivity, actual dimension compatibility, metadata mutation semantics, and stale-point deletion require runtime verification.
- The global bearer secret is a service-to-service trust boundary, not a substitute for mailbox grant checks. Consider per-caller HMAC signatures or scoped service credentials before exposing this API to any caller other than the trusted worker.
- No live Qdrant operations, build, typecheck, lint, or tests have been run for this implementation. Do not mark it production-ready based on source changes alone.
- The ai-comms-agent outbox adapter and sync loop are intentionally not connected yet. Bind only after ISS-026 is closed and the adapter can supply a freshly authorized account allowlist for retrieval.

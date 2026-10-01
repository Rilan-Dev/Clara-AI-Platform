# Clara host binding for AI Platform Core

This is the first concrete host integration for the extracted AI Platform Core.

The binding connects Clara's existing tenant/configuration, provider, RAG, conversation context, chat streaming, tool and realtime voice services behind one host-facing runtime seam.

Bound path:
Identity/Tenant → Provider Resolver → Tool Registry seam → Clara RAG → Context/Conversation → Chat Provider → Realtime Voice Transport

Boundaries:
- Clara remains authoritative for tenant/agent/KB identity.
- Clara Qdrant remains the knowledge source.
- Brain provider and realtime voice provider remain separate axes.
- Vendor credentials remain server-side.
- No vendor knowledge base replaces Clara Qdrant.
- Unsupported Doable infrastructure is not silently emulated.
- The immutable Doable extraction is not modified or imported.

Existing production routes are intentionally unchanged in this first wiring step. New routes/features can migrate to this seam incrementally with behavior-preserving tests.

# SESSION-061 — I-6 MCP Tool Bridge bounded hardening

Date: 2026-10-08
Owner: ChatGPT
Phase: Integrations Framework I-6
Status: IMPLEMENTATION IN PROGRESS

## Finding

Source-level acceptance review of the active I-6 bridge identified two fail-closed boundary gaps:

1. An explicitly empty `allowedSurfaces` array was treated as if the field were omitted, widening a tool to all Clara surfaces.
2. Sanitizing server/tool identifiers before name generation could collapse distinct identities into the same runtime tool name, causing one capability to be silently shadowed.

## Corrections

- `2cd0a2be62f7bbdb81327b3991f8c65177d34dc6`:
  - treats `allowedSurfaces: []` as zero allowed surfaces;
  - keeps omitted `allowedSurfaces` as the documented default of chat/realtime/embed;
  - adds an identity-derived suffix to every normalized MCP tool name so sanitization cannot create ordinary short-name collisions.
- `d4bfbe112863696c99ad7abb81857a9399f079c2`:
  - regression for explicit empty surface allowlist;
  - regression proving distinct sanitized identities receive distinct names;
  - retains the 64-character name bound.

## Verification disposition

Source-level architect review only. No GitHub Actions, Vercel, Gate-C, Gate-D, or continuous verification was awaited.

## Scope boundary

No MCP transport/server hosting, persistence/OAuth, marketplace, billing, production promotion, or unrelated implementation.

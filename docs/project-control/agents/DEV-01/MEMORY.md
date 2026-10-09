# DEV-01 Role-Local Memory

This is durable memory for DEV-01. It supplements, but never overrides, shared APCP memory or repository authority.

## Read before work
- docs/project-control/AGENT_MEMORY.md
- docs/project-control/AGENT_EVENTS.md
- docs/project-control/AGENT_SESSIONS.md
- docs/project-control/AGENT_HANDOFF.md
- docs/project-control/AGENT_BACKLOG.md
- this file
- current project-control state and applicable architecture/plan

## Record
- recurring issues;
- role-specific mistakes and prevention;
- successful patterns;
- failed approaches;
- environment-specific observations;
- lessons that should be promoted to AGENT_MEMORY.md when cross-agent.

## Do not store
Secrets, tokens, passwords, private keys, or sensitive personal data.

<!-- Append durable DEV-01 lessons below. -->


- **Date/session:** 2026-10-09 / SESSION-DEV-20261009-01
- **Agent:** DEV-01 / Forge
- **Issue/symptom:** Realtime voice exposed only `rag_search`; integration tools could not be invoked by a live voice session.
- **Root cause:** The Realtime session descriptor list and browser tool-call handler were not connected to the existing server-side integration runtime.
- **Failed approach:** Treating client-supplied KB/tenant/agent identity or a model tool descriptor as sufficient authorization would bypass server-side provenance and tenant boundaries.
- **Remedy:** Gate descriptors behind both existing default-off flags and authenticated KB membership; submit calls to a same-origin route that derives org/agent/user/session identity from server state and invokes the existing Unified Tool Runtime.
- **Prevention:** Every voice tool call must pass server authentication, KB access checks, a factory-minted execution context, and the existing runtime; public embed sessions must not receive these workspace integration tools.
- **Related record:** `src/modules/assistant/api/realtime-tool.ts`; source commits a2dee343b099edef6ad6337fef976047c3f59aa5, c36b5b67beabad175ea9530293846ef8763b3151, f3e8efda5b7a12173e313ee4f476774c62092e52, a64e8f3258b9ab8e59f4f0258c600b1e0ddf13e9, a218e2a354e0c83e7944dbe9b32ad6bebbb574bf, f830efd8fb03f778a4277b2817cc2e684266c3cb, 29e470aea416cd3cc1af56e0a27a1320013498f5, e6da6968d3d7d6e422b309e5188562578f2adb56.

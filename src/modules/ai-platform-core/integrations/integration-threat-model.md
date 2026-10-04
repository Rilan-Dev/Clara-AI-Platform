# Integrations Framework — I-1 Trust-Boundary Threat Model

## Purpose

This document is the I-1 security boundary for the host-neutral Integrations Framework. It defines what the reusable core may describe and what must remain inside host adapters. It does not authorize runtime integration execution.

## Assets

- tenant/org/project/user execution identity;
- integration connection identity and scope;
- opaque credential handles;
- OAuth authorization code and state;
- integration action definitions and validated inputs;
- outbound destination and HTTP method;
- tool definitions/results;
- operational telemetry.

## Trust boundaries

1. **Model/provider → integration contract**
   - Provider payloads are untrusted.
   - No provider payload receives decrypted credentials.
   - Action inputs must be schema-validated before execution.

2. **Platform core → host adapters**
   - `PlatformExecutionContext` is the only execution identity input.
   - Persistence, credential decryption, OAuth client secrets, and egress decisions remain adapter-owned.
   - Generic core contracts must not provide arbitrary credential-bearing metadata bags.

3. **Credential vault → action runner**
   - Core receives an opaque `IntegrationCredentialHandle`, not plaintext secrets.
   - Decryption/execution stays inside the host-controlled action boundary.

4. **Integration action → Unified Tool Runtime**
   - Integration actions must be represented through `ToolDefinition` and invoked through the Phase 7 Unified Tool Runtime.
   - No second tool executor is permitted.

5. **Action runner → network**
   - Outbound HTTP requires an explicit host-owned egress/SSRF policy.
   - I-1 defines the port only; it does not implement network access.

6. **Runtime → telemetry**
   - Raw credentials, access tokens, client secrets, OAuth codes, and arbitrary secret-bearing error details must not enter generic telemetry/result envelopes.
   - D-023 remains binding: I-1 does not create or alter billable usage semantics.

## Threats and required controls

| Threat | Required control | I-1 status |
|---|---|---|
| Cross-tenant connection access | execution context + host adapter scope checks | Port defined; runtime enforcement deferred to I-2 |
| Credential leakage | opaque credential handles; no generic metadata/details bags | Contract enforced |
| OAuth state tampering/replay | integrity-protected, tenant-bound state | Port defined; implementation deferred |
| SSRF / uncontrolled egress | explicit host egress policy adapter | Port defined; implementation deferred |
| Duplicate tool execution path | ToolDefinition + Unified Tool Runtime bridge | Contract enforced |
| Invalid action arguments | zod action schemas | Contract enforced |
| Secret-bearing error propagation | bounded error vocabulary without arbitrary details | Contract enforced |
| Ambiguous multi-connection access | concrete connection IDs for get/disconnect/credential lookup | Contract enforced |
| New billing semantics | preserve D-023 and existing usage spine | Contract boundary; no billing implementation |

## I-1 stopping boundary

I-1 does not implement OAuth, persistence, credential storage/decryption, outbound HTTP, egress enforcement, integration action execution, Activepieces, deployment, or billing changes.

Those surfaces require separately authorized sub-phases with the applicable Gate E/F and security evidence.

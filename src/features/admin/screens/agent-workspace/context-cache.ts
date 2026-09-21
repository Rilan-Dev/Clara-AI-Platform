"use client";

/**
 * src/features/admin/screens/agent-workspace/context-cache.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Short-lived client cache for the agent workspace context.
 *
 * Both the organisation sidebar's agent identity block and the workspace
 * shell provider need the same context (agent name, Main branch, versions);
 * this cache dedupes those fetches for 60 seconds so navigating between
 * workspace tabs does not re-query. Explicit refetches (after saving a draft
 * or publishing) always bypass the cache.
 */

import {
  fetchAgentWorkspaceContext,
  type AgentWorkspaceContextDTO,
} from "@/modules/admin-ui/ai-platform-api";

const CACHE_TTL_MS = 60_000;

const cache = new Map<string, { value: AgentWorkspaceContextDTO; expires: number }>();
const inflight = new Map<string, Promise<AgentWorkspaceContextDTO>>();

/** Cached context fetch — dedupes concurrent callers and serves fresh-enough reads. */
export function fetchAgentWorkspaceContextCached(agentId: string): Promise<AgentWorkspaceContextDTO> {
  const hit = cache.get(agentId);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);

  const pending = inflight.get(agentId);
  if (pending) return pending;

  const request = fetchAgentWorkspaceContext(agentId)
    .then((value) => {
      cache.set(agentId, { value, expires: Date.now() + CACHE_TTL_MS });
      inflight.delete(agentId);
      return value;
    })
    .catch((err: unknown) => {
      inflight.delete(agentId);
      throw err;
    });
  inflight.set(agentId, request);
  return request;
}

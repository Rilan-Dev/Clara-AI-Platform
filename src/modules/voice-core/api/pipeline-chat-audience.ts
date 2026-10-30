/**
 * Select the correct chat transport for an already authorized voice session.
 *
 * IMPORTANT: This checks credential family only, not whether a credential is
 * valid. Callers must first run embedVoiceGuard() for published / widget
 * visitors; the workspace transport must keep its tenant RBAC checks.
 */
export function classifyVoicePipelineSession(
  authorization: string | null,
): { chatEndpoint: "/api/public/chat" | "/api/embed/chat" | "/api/chat"; isExternalSession: boolean } {
  if (authorization?.startsWith("Bearer pub_v1.")) {
    // Public published page: HMAC / expiry / deployment / KB validation is
    // performed by embedVoiceGuard before issuing this session descriptor,
    // and again by /api/public/chat on every answer.
    return { chatEndpoint: "/api/public/chat", isExternalSession: true };
  }
  if (authorization?.startsWith("Bearer clr_")) {
    return { chatEndpoint: "/api/embed/chat", isExternalSession: true };
  }
  return { chatEndpoint: "/api/chat", isExternalSession: false };
}

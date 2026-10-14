/**
 * scripts/ws-lifecycle.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared upstream-WebSocket lifecycle helpers for the relay scripts
 * (sarvam-tts-relay / elevenlabs-relay / sarvam-relay — attached by start.mjs).
 *
 * WHY THIS EXISTS — a ws@8 quirk that polluted production logs:
 * calling close() OR terminate() on a socket that is still CONNECTING routes
 * through abortHandshake(), which emits a synthetic
 *   "WebSocket was closed before the connection was established"
 * error (nextTick) followed by 'close'. Every relay teardown path that races
 * a pending vendor handshake (browser disconnects while the vendor endpoint
 * is still handshaking, generation interrupt, session close) therefore
 * produced scary [sarvam-tts-relay] upstream errors even though nothing was
 * actually wrong with the vendor.
 *
 * All relay teardowns must go through closeUpstreamSocket(), which marks the
 * socket so its synthetic abortHandshake events can be identified and
 * filtered by the relay's error/close handlers (isSelfClosedSocket()).
 *
 * Plain JS on purpose: relay scripts are plain .mjs modules that run inside
 * the repo relay server (scripts/start.mjs) — they cannot import TS.
 */
import { WebSocket } from "ws";

/**
 * Close an upstream WebSocket without tripping ws@8's synthetic
 * abortHandshake error. CONNECTING/CLOSING sockets are terminate()d (and
 * marked so handlers can filter the synthetic events); only an OPEN socket
 * gets a clean close(code, reason).
 */
export function closeUpstreamSocket(socket, code = 1000, reason = "closed") {
  if (!socket) return;
  const state = socket.readyState;
  if (state === WebSocket.CONNECTING || state === WebSocket.CLOSING) {
    // Mark BEFORE terminating: ws emits the synthetic error on nextTick,
    // after this function has returned.
    socket.__relaySelfClosed = true;
    try { socket.terminate(); } catch {}
    return;
  }
  try { socket.close(code, reason); } catch {}
}

/** True when closeUpstreamSocket() deliberately tore this socket down. */
export function isSelfClosedSocket(socket) {
  return Boolean(socket?.__relaySelfClosed);
}

/** Best-effort host of an upstream URL for actionable error messages. */
export function safeWsHost(url) {
  try { return new URL(url).host; } catch { return "upstream"; }
}

/**
 * Arm a handshake deadline for an upstream socket. A vendor endpoint that
 * accepts TCP but never completes the WebSocket upgrade (e.g. a misconfigured
 * provider base URL behind a proxy) otherwise parks the socket in CONNECTING
 * until the browser gives up — with every later teardown logging the
 * confusing "closed before established" error. onTimeout(host) runs BEFORE
 * the socket is terminated so the caller can surface an actionable message;
 * the synthetic abortHandshake events that follow are filtered by
 * isSelfClosedSocket()/isHandshakeTimedOut().
 *
 * Returns disarm() — call it from the socket's open/close/error handlers.
 */
export function armHandshakeTimeout({ socket, url, timeoutMs = 10_000, onTimeout }) {
  const timer = setTimeout(() => {
    if (socket.readyState !== WebSocket.CONNECTING) return;
    socket.__relayHandshakeTimedOut = true;
    try { onTimeout?.(safeWsHost(url)); } catch {}
    try { socket.terminate(); } catch {}
  }, timeoutMs);
  return () => clearTimeout(timer);
}

/** True when armHandshakeTimeout() fired for this socket. */
export function isHandshakeTimedOut(socket) {
  return Boolean(socket?.__relayHandshakeTimedOut);
}

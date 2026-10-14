/**
 * Type surface for scripts/ws-lifecycle.mjs — shared WS lifecycle helpers used
 * by the relay (scripts/start.mjs) and covered by unit tests that import the
 * .mjs directly. Signatures mirror the runtime guards: every helper tolerates
 * null/undefined sockets (defensive relay code) instead of throwing.
 * Without this declaration, `tsc --noEmit` fails with TS7016 ("Could not find
 * a declaration file for module …ws-lifecycle.mjs").
 */
import type { WebSocket } from "ws";

type MaybeSocket = WebSocket | null | undefined;

export function closeUpstreamSocket(socket: MaybeSocket, code?: number, reason?: string): void;
export function isSelfClosedSocket(socket: MaybeSocket): boolean;
export function safeWsHost(url: string): string;
export function armHandshakeTimeout(options: {
  socket: WebSocket;
  url: string;
  timeoutMs?: number;
  onTimeout?: (host: string) => void;
}): () => void;
export function isHandshakeTimedOut(socket: MaybeSocket): boolean;

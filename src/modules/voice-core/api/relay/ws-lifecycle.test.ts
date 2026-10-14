/**
 * Unit tests for scripts/ws-lifecycle.mjs — the shared relay teardown helpers.
 *
 * Production context: ws@8 routes close() AND terminate() on a CONNECTING
 * socket through abortHandshake(), which emits the synthetic
 * "WebSocket was closed before the connection was established" error — the
 * exact noise that polluted docker logs as
 * "[sarvam-tts-relay] upstream error: ..." whenever the browser disconnected
 * while the vendor endpoint was still handshaking. closeUpstreamSocket()
 * must terminate quietly + mark the socket so relay handlers can filter the
 * synthetic events; armHandshakeTimeout() must fail fast on endpoints that
 * never complete the upgrade.
 */
import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import {
  armHandshakeTimeout,
  closeUpstreamSocket,
  isHandshakeTimedOut,
  isSelfClosedSocket,
  safeWsHost,
} from "../../../../../scripts/ws-lifecycle.mjs";

function stubSocket(readyState: number) {
  return {
    readyState,
    terminate: vi.fn(),
    close: vi.fn(),
  } as unknown as import("ws").WebSocket & { terminate: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
}

describe("closeUpstreamSocket — CONNECTING-safe teardown", () => {
  it("terminates (never close()s) a CONNECTING socket and marks it self-closed", () => {
    const socket = stubSocket(WebSocket.CONNECTING);
    closeUpstreamSocket(socket, 1000, "Browser closed");
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    expect(socket.close).not.toHaveBeenCalled();
    expect(isSelfClosedSocket(socket)).toBe(true);
  });

  it("issues a clean close() on an OPEN socket without marking it", () => {
    const socket = stubSocket(WebSocket.OPEN);
    closeUpstreamSocket(socket, 1011, "Reconnect budget exhausted");
    expect(socket.close).toHaveBeenCalledWith(1011, "Reconnect budget exhausted");
    expect(socket.terminate).not.toHaveBeenCalled();
    expect(isSelfClosedSocket(socket)).toBe(false);
  });

  it("terminates a CLOSING socket quietly", () => {
    const socket = stubSocket(WebSocket.CLOSING);
    closeUpstreamSocket(socket, 1000, "closed");
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    expect(socket.close).not.toHaveBeenCalled();
  });

  it("tolerates null/undefined sockets", () => {
    expect(() => closeUpstreamSocket(null)).not.toThrow();
    expect(() => closeUpstreamSocket(undefined)).not.toThrow();
    expect(isSelfClosedSocket(null)).toBe(false);
    expect(isSelfClosedSocket(undefined)).toBe(false);
  });
});

describe("safeWsHost", () => {
  it("extracts the host from an upstream URL", () => {
    expect(safeWsHost("wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v3")).toBe("api.sarvam.ai");
    expect(safeWsHost("https://api.vendor.ai/text-to-speech/ws")).toBe("api.vendor.ai");
  });

  it("falls back to a generic label for unparsable URLs", () => {
    expect(safeWsHost("not a url")).toBe("upstream");
    expect(safeWsHost("")).toBe("upstream");
  });
});

describe("armHandshakeTimeout — fail fast on hung vendor endpoints", () => {
  it("terminates a still-CONNECTING socket after the deadline and reports the host", () => {
    vi.useFakeTimers();
    try {
      const socket = stubSocket(WebSocket.CONNECTING);
      const onTimeout = vi.fn();
      armHandshakeTimeout({ socket, url: "wss://api.vendor.ai/text-to-speech/ws", timeoutMs: 10_000, onTimeout });

      vi.advanceTimersByTime(10_001);
      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(onTimeout).toHaveBeenCalledWith("api.vendor.ai");
      expect(socket.terminate).toHaveBeenCalledTimes(1);
      expect(isHandshakeTimedOut(socket)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("disarm() cancels the deadline (called from open/close/error handlers)", () => {
    vi.useFakeTimers();
    try {
      const socket = stubSocket(WebSocket.CONNECTING);
      const onTimeout = vi.fn();
      const disarm = armHandshakeTimeout({ socket, url: "wss://api.sarvam.ai/ws", timeoutMs: 10_000, onTimeout });

      disarm();
      vi.advanceTimersByTime(30_000);
      expect(onTimeout).not.toHaveBeenCalled();
      expect(socket.terminate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing once the socket has left CONNECTING (open raced the timer)", () => {
    vi.useFakeTimers();
    try {
      const socket = stubSocket(WebSocket.OPEN);
      const onTimeout = vi.fn();
      armHandshakeTimeout({ socket, url: "wss://api.sarvam.ai/ws", timeoutMs: 10_000, onTimeout });

      vi.advanceTimersByTime(10_001);
      expect(onTimeout).not.toHaveBeenCalled();
      expect(socket.terminate).not.toHaveBeenCalled();
      expect(isHandshakeTimedOut(socket)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

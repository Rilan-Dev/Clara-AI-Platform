import { describe, expect, it, vi } from "vitest";
import { isMicStreamMuted, setMicStreamMuted } from "./mic-mute";

/** Minimal MediaStream/AudioTrack stand-ins — only the surface the helpers touch. */
function fakeTrack(opts: { enabled?: boolean; readyState?: string } = {}) {
  return {
    enabled: opts.enabled ?? true,
    readyState: opts.readyState ?? "live",
    // spies so we can assert no spurious property writes on idempotent calls
  };
}

function fakeStream(tracks: Array<ReturnType<typeof fakeTrack>>) {
  return {
    getAudioTracks: () => tracks,
  } as unknown as MediaStream;
}

describe("setMicStreamMuted", () => {
  it("disables live audio tracks when muting", () => {
    const t1 = fakeTrack();
    const t2 = fakeTrack();
    expect(setMicStreamMuted(fakeStream([t1, t2]), true)).toBe(true);
    expect(t1.enabled).toBe(false);
    expect(t2.enabled).toBe(false);
  });

  it("re-enables audio tracks when unmuting", () => {
    const t = fakeTrack({ enabled: false });
    expect(setMicStreamMuted(fakeStream([t]), false)).toBe(true);
    expect(t.enabled).toBe(true);
  });

  it("skips ended tracks and returns false when none are live", () => {
    const ended = fakeTrack({ readyState: "ended" });
    expect(setMicStreamMuted(fakeStream([ended]), true)).toBe(false);
    expect(ended.enabled).toBe(true); // untouched
  });

  it("returns false for null/undefined/trackless streams", () => {
    expect(setMicStreamMuted(null, true)).toBe(false);
    expect(setMicStreamMuted(undefined, false)).toBe(false);
    expect(setMicStreamMuted(fakeStream([]), true)).toBe(false);
  });

  it("is idempotent — repeat calls do not flip anything", () => {
    const t = fakeTrack();
    const stream = fakeStream([t]);
    setMicStreamMuted(stream, true);
    const enabledAfterFirst = t.enabled;
    setMicStreamMuted(stream, true);
    expect(t.enabled).toBe(enabledAfterFirst);
    expect(t.enabled).toBe(false);
    setMicStreamMuted(stream, false);
    expect(t.enabled).toBe(true);
    setMicStreamMuted(stream, false);
    expect(t.enabled).toBe(true);
  });

  it("tolerates streams without getAudioTracks (defensive)", () => {
    expect(setMicStreamMuted({} as MediaStream, true)).toBe(false);
  });
});

describe("isMicStreamMuted", () => {
  it("reports muted only when every live track is disabled", () => {
    const t1 = fakeTrack({ enabled: false });
    const t2 = fakeTrack({ enabled: false });
    expect(isMicStreamMuted(fakeStream([t1, t2]))).toBe(true);
    t2.enabled = true;
    expect(isMicStreamMuted(fakeStream([t1, t2]))).toBe(false);
  });

  it("ignores ended tracks", () => {
    const live = fakeTrack({ enabled: true });
    const ended = fakeTrack({ enabled: false, readyState: "ended" });
    expect(isMicStreamMuted(fakeStream([live, ended]))).toBe(false);
    live.enabled = false;
    // only the live (now disabled) track counts → muted
    expect(isMicStreamMuted(fakeStream([live, ended]))).toBe(true);
  });

  it("returns false for null/empty streams", () => {
    expect(isMicStreamMuted(null)).toBe(false);
    expect(isMicStreamMuted(fakeStream([]))).toBe(false);
  });
});

describe("mic-mute contract (privacy semantics)", () => {
  it("muting keeps the session-alive contract: tracks stay 'live', only enabled flips", () => {
    const t = fakeTrack();
    setMicStreamMuted(fakeStream([t]), true);
    expect(t.readyState).toBe("live"); // NOT stopped — session persists
    expect(t.enabled).toBe(false); // but silent
  });

  it("mute → unmute round-trips without re-acquisition", () => {
    const t = fakeTrack();
    const stream = fakeStream([t]);
    setMicStreamMuted(stream, true);
    expect(isMicStreamMuted(stream)).toBe(true);
    setMicStreamMuted(stream, false);
    expect(isMicStreamMuted(stream)).toBe(false);
    expect(t.enabled).toBe(true);
  });

  it("no spurious writes: enabled setter untouched when state already matches", () => {
    const t = fakeTrack();
    const spy = vi.fn();
    Object.defineProperty(t, "enabled", {
      get: () => true,
      set: spy,
      configurable: true,
    });
    setMicStreamMuted(fakeStream([t]), false); // already unmuted
    expect(spy).not.toHaveBeenCalled();
  });
});

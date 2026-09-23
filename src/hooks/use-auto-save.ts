"use client";

/**
 * src/hooks/use-auto-save.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Debounced auto-save for configuration editors.
 *
 * Policy (platform-wide "no Save button" sweep):
 *   • Persona / config / visual editors save the DRAFT automatically a beat
 *     after the user stops typing (default 1500 ms — never per keystroke).
 *   • Credential surfaces (payments, email delivery, env vars) keep ONE
 *     explicit form-level Save button — those are batch-coherent secrets.
 *
 * Guarantees:
 *   • LATEST-WINS — a slow in-flight save never marks newer edits as saved
 *     (every completion re-checks the current value against the baseline).
 *   • ECHO-GUARD — `onExternalChange` lets callers decide whether an incoming
 *     prop change is the echo of their own save (skip reset) or a genuine
 *     external update (accept it).
 *   • FLUSH — pending edits are saved on unmount and on beforeunload, so a
 *     draft is never silently lost to navigation.
 *   • NO SPINNING — status only reaches "pending" after `delay` of quiet is
 *     exceeded? No: pending is immediate feedback ("Unsaved"), the network
 *     call happens only after the debounce elapses.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export type AutoSaveOptions<T> = {
  /** The live value being edited (compared by serialization). */
  value: T;
  /** Persists the value. Should throw on failure. */
  save: (value: T) => Promise<void> | void;
  /** Quiet period before the network call. Default 1500 ms. */
  delay?: number;
  /** Master switch (e.g. read-only viewers). Default true. */
  enabled?: boolean;
  /** Value comparison — default JSON.stringify equality. */
  serialize?: (value: T) => string;
  /** Called after every successful save. */
  onSaved?: (value: T) => void;
  /** Called when a save fails (non-throwing so UI can render it). */
  onError?: (error: Error) => void;
};

export type AutoSaveState = {
  status: AutoSaveStatus;
  /** Wall-clock time of the last successful save (drives "Saved just now"). */
  savedAt: Date | null;
  error: string | null;
  /** True while unsaved edits exist (pending or a failed save). */
  dirty: boolean;
  /** Saves immediately when dirty (used by parents on unmount/navigation). */
  flush: () => Promise<void>;
  /** True when `value` equals the last successfully saved snapshot — lets
   *  callers distinguish their own save's echo from an external update. */
  baselineMatches: (value: unknown) => boolean;
  /** Adopts `value` as the new saved baseline (external resets — e.g. the
   *  editor's config prop changed by a version restore or agent switch). */
  resetBaseline: (value: unknown) => void;
};

export function useAutoSave<T>(options: AutoSaveOptions<T>): AutoSaveState {
  const { value, save, delay = 1500, enabled = true, serialize = defaultSerialize, onSaved, onError } = options;

  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Refs: the save pipeline must never depend on render timing ────────────
  const valueRef = useRef(value);
  const baselineRef = useRef(serialize(value)); // last SUCCESSFULLY saved snapshot
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(0); // in-flight save sequence
  const dirtyRef = useRef(false);
  const mountedRef = useRef(true);
  const saveRef = useRef(save);
  const onSavedRef = useRef(onSaved);
  const onErrorRef = useRef(onError);

  valueRef.current = value;
  saveRef.current = save;
  onSavedRef.current = onSaved;
  onErrorRef.current = onError;

  const runSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const snapshot = valueRef.current;
    const serialized = serialize(snapshot);
    if (serialized === baselineRef.current) {
      dirtyRef.current = false;
      setStatus("idle");
      return;
    }
    const seq = ++inFlightRef.current;
    setStatus("saving");
    try {
      await saveRef.current(snapshot);
      if (seq !== inFlightRef.current || !mountedRef.current) return; // superseded or unmounted
      baselineRef.current = serialized;
      dirtyRef.current = serialize(valueRef.current) !== serialized;
      setError(null);
      setStatus("saved");
      setSavedAt(new Date());
      onSavedRef.current?.(snapshot);
      // Edits that arrived while saving → schedule another pass.
      if (dirtyRef.current) scheduleRef.current?.();
    } catch (err) {
      if (seq !== inFlightRef.current || !mountedRef.current) return;
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e.message);
      setStatus("error");
      onErrorRef.current?.(e);
    }
  }, [serialize]);

  // Indirection so runSave can re-schedule itself without a dependency cycle.
  const scheduleRef = useRef<(() => void) | null>(null);
  scheduleRef.current = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void runSave(), delay);
  };

  // ── React to value changes (debounce) ──────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const serialized = serialize(value);
    if (serialized === baselineRef.current) {
      if (status === "pending") setStatus("idle");
      return;
    }
    dirtyRef.current = true;
    setStatus("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void runSave(), delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    // Only value identity changes drive the debounce; the pipeline refs keep
    // save/onSaved fresh without re-subscribing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled, delay, serialize]);

  // ── Flush pending edits on unmount ─────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dirtyRef.current) void runSave(); // fire-and-forget keep-alive save
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── beforeunload guard while edits are at risk ─────────────────────────────
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current && serialize(valueRef.current) !== baselineRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [serialize]);

  const flush = useCallback(async () => {
    if (!dirtyRef.current && serialize(valueRef.current) === baselineRef.current) return;
    await runSave();
  }, [runSave, serialize]);

  const baselineMatches = useCallback(
    (value: unknown) => serialize(value as T) === baselineRef.current,
    [serialize],
  );

  const resetBaseline = useCallback(
    (value: unknown) => {
      baselineRef.current = serialize(value as T);
      if (serialize(valueRef.current) === baselineRef.current) {
        dirtyRef.current = false;
        setStatus("idle");
      }
    },
    [serialize],
  );

  const dirty = status === "pending" || status === "error" || dirtyRef.current;
  return { status, savedAt, error, dirty, flush, baselineMatches, resetBaseline };
}

function defaultSerialize(value: unknown): string {
  return JSON.stringify(value) ?? "";
}

/**
 * Status copy for auto-save indicators (single source so every surface reads
 * the same: "Saving…", "All changes saved", "Draft saved just now"…).
 */
export function autoSaveStatusText(status: AutoSaveStatus, savedAt: Date | null): string {
  switch (status) {
    case "pending":
      return "Unsaved edits";
    case "saving":
      return "Saving…";
    case "saved":
      return savedAt ? `Saved ${timeAgoShort(savedAt)}` : "Saved";
    case "error":
      return "Save failed — retrying on next edit";
    default:
      return "All changes saved";
  }
}

export function timeAgoShort(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

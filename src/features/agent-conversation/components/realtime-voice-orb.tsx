"use client";

/**
 * src/features/agent-conversation/components/realtime-voice-orb.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The realtime voice orb — one shared visual engine with FOUR deliberately
 * distinct visual languages so the user always knows, at a glance, who owns
 * the conversation floor:
 *
 *   • USER SPEAKING ("listening") — "Six Wave Rings": six concentric arcs
 *     around the core whose swept length breathes with the microphone
 *     amplitude bands; the ring stack slowly rotates, alternating clockwise
 *     / counter-clockwise per ring. Visual language: INWARD, ROTATING,
 *     COOL — the assistant is receiving you.
 *
 *   • AGENT SPEAKING ("speaking") — "Ripple Bloom": a glowing core that
 *     pulses with the playback amplitude while soft rings ripple OUTWARD
 *     and fade. Visual language: OUTWARD, RADIANT, WARM — the assistant is
 *     answering.
 *
 *   • THINKING — three orbit dots travelling a dashed orbit ring. Calm,
 *     deterministic motion that reads as "processing", never as "speaking".
 *
 *   • CONNECTING — a single breathing halo; the lowest-motion state.
 *
 * State switching is instant (driven by the ui-state machine, not by audio
 * thresholds) so the floor handoff User → Thinking → Agent feels immediate,
 * while audio levels only modulate the INTENSITY of the active visual.
 *
 * Keyframes live in globals.css (clara-orb-*) so CSS drives the continuous
 * rotations/ripples off the main thread; React only feeds per-band amplitudes.
 */

import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type OrbState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupting"
  | "error";

interface RealtimeVoiceOrbProps {
  state: OrbState;
  /** Mic amplitude bands (24 values, 0..1) — user speaking intensity. */
  micLevels: number[];
  /** Playback amplitude bands (24 values, 0..1) — agent speaking intensity. */
  agentLevels: number[];
  primaryColour: string;
  accentColour: string;
  agentName: string;
  avatarUrl?: string | null;
  /** Pixel size of the square orb stage (default 260). */
  size?: number;
}

/** Aggregate the 24 visualizer bands into six wave bands (mean of 4). */
function sixBands(levels: number[]): number[] {
  if (!levels || levels.length === 0) return [0, 0, 0, 0, 0, 0];
  const bands = [0, 0, 0, 0, 0, 0];
  const group = Math.max(1, Math.floor(levels.length / 6));
  for (let i = 0; i < 6; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i * group; j < Math.min((i + 1) * group, levels.length); j++) {
      sum += levels[j] ?? 0;
      count++;
    }
    bands[i] = count > 0 ? sum / count : 0;
  }
  return bands;
}

function average(levels: number[]): number {
  if (!levels || levels.length === 0) return 0;
  return levels.reduce((a, b) => a + (b ?? 0), 0) / levels.length;
}

const RING_RADII = [38, 47, 56, 65, 74, 83];
const RING_STROKE = [5.5, 5, 4.5, 4, 3.5, 3];

function RealtimeVoiceOrbImpl({
  state,
  micLevels,
  agentLevels,
  primaryColour,
  accentColour,
  agentName,
  avatarUrl,
  size = 260,
}: RealtimeVoiceOrbProps) {
  const bands = useMemo(() => sixBands(micLevels), [micLevels]);
  const agentPulse = useMemo(() => average(agentLevels), [agentLevels]);
  const userPulse = useMemo(() => average(micLevels), [micLevels]);

  const effective: OrbState = state === "interrupting" ? "listening" : state;
  const userFloor = effective === "listening";
  const agentFloor = effective === "speaking";

  const coreSize = 108;
  const coreScale = agentFloor ? 1 + agentPulse * 0.34 : userFloor ? 1 + userPulse * 0.1 : 1;

  return (
    <div
      className="relative select-none"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${agentName} voice orb — ${effective}`}
    >
      {/* Ambient glow — colour follows the floor owner. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full blur-2xl"
        animate={{
          opacity: effective === "idle" ? 0.18 : userFloor ? 0.32 : agentFloor ? 0.45 : 0.25,
          scale: coreScale,
        }}
        transition={{ type: "tween", ease: "easeOut", duration: 0.12 }}
        style={{
          background: `radial-gradient(circle at 50% 50%, ${userFloor ? primaryColour : accentColour}59, transparent 68%)`,
        }}
      />

      {/* ── USER SPEAKING — Six Wave Rings ───────────────────────────────── */}
      {userFloor && (
        <svg
          aria-hidden
          viewBox="0 0 200 200"
          className="absolute inset-0 h-full w-full"
        >
          {RING_RADII.map((radius, i) => {
            const circumference = 2 * Math.PI * radius;
            // Wave amplitude → swept arc length (min 8% so rings stay visible).
            const swept = Math.max(0.08, Math.min(1, bands[i] * 1.15)) * circumference * 0.62;
            return (
              <g
                key={radius}
                className={cn(i % 2 === 0 ? "clara-orb-spin-cw" : "clara-orb-spin-ccw")}
                style={{ transformOrigin: "100px 100px", animationDuration: `${9 + i * 2.5}s` }}
              >
                <circle
                  cx="100"
                  cy="100"
                  r={radius}
                  fill="none"
                  stroke={primaryColour}
                  strokeWidth={RING_STROKE[i]}
                  strokeLinecap="round"
                  strokeDasharray={`${swept} ${circumference - swept}`}
                  opacity={0.28 + (bands[i] ?? 0) * 0.72}
                  style={{ transition: "stroke-dasharray 90ms linear, opacity 90ms linear" }}
                />
                {/* Faint full-circle guide so the ring reads as a ring at rest. */}
                <circle
                  cx="100"
                  cy="100"
                  r={radius}
                  fill="none"
                  stroke={primaryColour}
                  strokeWidth={1}
                  opacity={0.16}
                />
              </g>
            );
          })}
        </svg>
      )}

      {/* ── AGENT SPEAKING — Ripple Bloom ────────────────────────────────── */}
      {agentFloor && (
        <div aria-hidden className="absolute inset-0 flex items-center justify-center">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="clara-orb-ripple absolute rounded-full"
              style={{
                width: coreSize + 46,
                height: coreSize + 46,
                border: `2px solid ${accentColour}`,
                animationDelay: `${i * 0.8}s`,
              }}
            />
          ))}
          {/* Orbiting spark — a small accent dot circling the bloom. */}
          <div
            className="clara-orb-spin-cw absolute"
            style={{ width: size, height: size, animationDuration: "6s", transformOrigin: "50% 50%" }}
          >
            <div
              className="absolute rounded-full"
              style={{
                width: 9,
                height: 9,
                top: 8,
                left: "50%",
                marginLeft: -4.5,
                background: accentColour,
                boxShadow: `0 0 12px ${accentColour}`,
              }}
            />
          </div>
        </div>
      )}

      {/* ── THINKING — orbit dots on a dashed ring ──────────────────────── */}
      {effective === "thinking" && (
        <div aria-hidden className="absolute inset-0 flex items-center justify-center">
          <div
            className="absolute rounded-full border border-dashed"
            style={{
              width: coreSize + 58,
              height: coreSize + 58,
              borderColor: `${accentColour}55`,
            }}
          />
          <div
            className="clara-orb-spin-cw absolute"
            style={{ width: coreSize + 58, height: coreSize + 58, animationDuration: "3.2s" }}
          >
            {[0, 120, 240].map((angle) => (
              <div
                key={angle}
                className="absolute rounded-full"
                style={{
                  width: 10,
                  height: 10,
                  top: -5,
                  left: "50%",
                  marginLeft: -5,
                  background: accentColour,
                  transform: `rotate(${angle}deg) translateY(${(coreSize + 58) / 2}px)`,
                  transformOrigin: "50% 50%",
                  opacity: 0.9,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── CONNECTING — breathing halo ─────────────────────────────────── */}
      {effective === "connecting" && (
        <div
          aria-hidden
          className="clara-orb-breathe absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: coreSize + 64,
            height: coreSize + 64,
            border: `2px solid ${primaryColour}66`,
          }}
        />
      )}

      {/* ── The core ──────────────────────────────────────────────────────── */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          animate={{ scale: coreScale }}
          transition={{ type: "tween", ease: "easeOut", duration: 0.1 }}
          className="relative flex items-center justify-center rounded-full"
          style={{
            width: coreSize,
            height: coreSize,
            background:
              effective === "error"
                ? "linear-gradient(135deg, #fee2e2, #fecaca)"
                : userFloor
                  ? `linear-gradient(135deg, ${primaryColour}, ${primaryColour}cc)`
                  : `linear-gradient(135deg, ${accentColour}, ${primaryColour})`,
            boxShadow: agentFloor
              ? `0 0 ${28 + agentPulse * 44}px ${accentColour}66`
              : `0 0 ${18 + userPulse * 22}px ${primaryColour}40`,
          }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full rounded-full object-cover"
              draggable={false}
            />
          ) : (
            <span
              className="text-2xl font-semibold text-white drop-shadow-sm"
              style={{ letterSpacing: "0.02em" }}
            >
              {agentName?.trim()?.charAt(0)?.toUpperCase() ?? "A"}
            </span>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export const RealtimeVoiceOrb = memo(RealtimeVoiceOrbImpl);

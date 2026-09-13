/**
 * src/instrumentation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Next.js instrumentation hook — runs ONCE when the server process starts,
 * before the first request is handled.
 *
 * This file is compiled for BOTH the Node.js and Edge runtimes, so it must
 * stay free of Node-only imports (fs/pg/etc.). The real startup logic lives
 * in instrumentation.node.ts and is loaded conditionally — Next replaces
 * process.env.NEXT_RUNTIME at compile time, so the edge bundle never even
 * references the Node-only module.
 *
 * Enabled via `experimental.instrumentationHook: true` (stable in Next 15).
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}

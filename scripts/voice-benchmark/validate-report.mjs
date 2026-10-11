#!/usr/bin/env node
/**
 * Acceptance gate for a captured conversation benchmark report.
 *
 * This validates measurement completeness, not answer correctness. It deliberately
 * refuses to call a run "fully validated" while response integrity/token usage
 * remain unavailable from the shared provider-neutral telemetry.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function arg(name) {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : null;
}
const reportPath = arg("report");
const expectedProvider = arg("provider");
if (!reportPath || !expectedProvider) {
  console.error("Usage: node scripts/voice-benchmark/validate-report.mjs --report=tool-results/provider.json --provider=openai");
  process.exit(2);
}
let report;
try {
  report = JSON.parse(readFileSync(resolve(reportPath), "utf8"));
} catch (error) {
  console.error("FAIL: cannot read report:", String(error));
  process.exit(2);
}
const failures = [];
const warnings = [];
if (report.schemaVersion !== 2) failures.push("report schemaVersion must be 2");
if (report.runStatus !== "completed") failures.push(`runStatus is ${report.runStatus ?? "missing"}, expected completed`);
if (String(report.expectedProvider ?? "").toLowerCase() !== expectedProvider.toLowerCase()) failures.push("expectedProvider does not match requested provider");
if (!Array.isArray(report.turns) || report.turns.length !== 5) failures.push("exactly five turn records are required");
if (!report.session?.welcomeEvent) failures.push("welcome/first-audio telemetry event is missing");
if (!Number.isFinite(report.session?.sessionClickToWelcomeAudioMs) || report.session.sessionClickToWelcomeAudioMs < 0) failures.push("session click-to-first-audio telemetry delta is missing or invalid");
for (const [index, turn] of (Array.isArray(report.turns) ? report.turns : []).entries()) {
  const prefix = `turn ${index + 1}`;
  if (!turn.telemetryBarrierReached) failures.push(`${prefix}: completion telemetry barrier was not reached`);
  if (!turn.providerMatch || String(turn.provider ?? "").toLowerCase() !== expectedProvider.toLowerCase()) failures.push(`${prefix}: provider mismatch`);
  if (!turn.sessionId) failures.push(`${prefix}: sessionId missing`);
  if (!turn.generationId && !turn.turnId) failures.push(`${prefix}: both generationId and turnId are missing`);
  if (typeof turn.latencies?.ttfaMs !== "number") warnings.push(`${prefix}: TTFA stage metric is unavailable`);
  if (turn.responseIntegrityStatus !== "verified") warnings.push(`${prefix}: final answer completeness/truncation is not verified`);
  if (turn.tokenUsageStatus !== "available") warnings.push(`${prefix}: provider token usage is not available`);
}
if (report.summary?.failedRequests > 0) warnings.push(`${report.summary.failedRequests} browser request(s) failed; inspect requestTimings/failures before accepting results`);
if (report.consoleErrors?.length > 0) warnings.push(`${report.consoleErrors.length} browser console error(s) recorded`);
if (failures.length) {
  console.error("FAIL — report is not acceptable as a complete five-turn timing run:");
  for (const item of failures) console.error(" -", item);
  process.exit(1);
}
console.log("PASS — five-turn timing telemetry is present for the requested provider.");
console.log("NOT A FULL FUNCTIONAL PASS — this gate does not verify answer correctness, non-truncation, token usage, server-internal call attribution, or actual audible playback.");
for (const item of warnings) console.warn("WARN -", item);

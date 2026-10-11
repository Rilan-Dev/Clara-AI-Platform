#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const validator = resolve(root, "scripts/voice-benchmark/validate-report.mjs");
const temp = mkdtempSync(join(tmpdir(), "clara-voice-report-test-"));
const validTurn = (n) => ({
  input: n,
  telemetryBarrierReached: true,
  provider: "openai",
  providerMatch: true,
  sessionId: "test-session",
  generationId: `generation-${n}`,
  turnId: `turn-${n}`,
  latencies: { ttfaMs: 420 },
  responseIntegrityStatus: "not-verified",
  tokenUsageStatus: "not-available"
});
const validReport = {
  schemaVersion: 2,
  runStatus: "completed",
  expectedProvider: "openai",
  session: { welcomeEvent: { provider: "openai" }, sessionClickToWelcomeAudioMs: 350 },
  turns: [1, 2, 3, 4, 5].map(validTurn),
  summary: { failedRequests: 0 },
  consoleErrors: []
};
function run(report, provider = "openai") {
  const path = join(temp, "report.json");
  writeFileSync(path, JSON.stringify(report));
  return spawnSync(process.execPath, [validator, `--report=${path}`, `--provider=${provider}`], {
    cwd: root,
    encoding: "utf8"
  });
}
try {
  const good = run(validReport);
  assert.equal(good.status, 0, `valid timing report should pass\nstdout: ${good.stdout}\nstderr: ${good.stderr}`);
  assert.match(good.stdout, /NOT A FULL FUNCTIONAL PASS/);

  const missingTurn = run({ ...validReport, turns: validReport.turns.slice(0, 4) });
  assert.notEqual(missingTurn.status, 0, "four turns must fail the five-turn gate");
  assert.match(missingTurn.stderr, /exactly five turn records/);

  const wrongProvider = run(validReport, "sarvam");
  assert.notEqual(wrongProvider.status, 0, "provider mismatch must fail");
  assert.match(wrongProvider.stderr, /expectedProvider does not match/);

  const missingCorrelation = structuredClone(validReport);
  missingCorrelation.turns[2].sessionId = null;
  missingCorrelation.turns[2].generationId = null;
  missingCorrelation.turns[2].turnId = null;
  const badCorrelation = run(missingCorrelation);
  assert.notEqual(badCorrelation.status, 0, "missing correlation IDs must fail");
  assert.match(badCorrelation.stderr, /sessionId missing/);
  assert.match(badCorrelation.stderr, /generationId and turnId are missing/);

  const missingIntegrity = run(validReport);
  assert.match(missingIntegrity.stderr, /answer completeness\/truncation is not verified/);
  assert.match(missingIntegrity.stderr, /provider token usage is not available/);

  console.log("PASS: voice benchmark report validator positive, negative, provider and correlation cases");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

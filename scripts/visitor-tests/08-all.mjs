import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const scripts = [
  "01-edge.mjs",
  "02-demo-config.mjs",
  "03-rag-search.mjs",
  "04-chat-rag.mjs",
  "05-realtime-session.mjs",
  "06-voice-connect-contract.mjs",
  "07-performance.mjs",
];

console.log("\n=== CLARA VISITOR DEMO FULL TEST SUITE ===\n");
for (const script of scripts) {
  console.log(`\n>>> RUN ${script}`);
  const result = spawnSync(process.execPath, [join(root, script)], { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    console.error(`\nSUITE FAIL | ${script} exited with ${result.status}`);
    process.exit(result.status || 1);
  }
}
console.log("\nSUITE PASS | all visitor demo layers completed\n");

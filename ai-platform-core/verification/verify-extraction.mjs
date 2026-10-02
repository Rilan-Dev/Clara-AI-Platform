#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const root = process.cwd();
const manifestPath = "ai-platform-core/extraction-manifest.json";
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, "utf8");
  return crypto.createHash("sha1").update(Buffer.concat([header, buffer])).digest("hex");
}

let failures = 0;
for (const entry of manifest.files) {
  const absolute = entry.target_path;
  if (!fs.existsSync(absolute)) {
    console.error(`MISSING ${absolute}`);
    failures++;
    continue;
  }
  const actual = gitBlobSha(fs.readFileSync(absolute));
  if (actual !== entry.source_blob_sha) {
    console.error(`MISMATCH ${absolute}: expected ${entry.source_blob_sha}, got ${actual}`);
    failures++;
  } else {
    console.log(`PASS ${absolute} ${actual}`);
  }
}

if (failures) {
  console.error(`Extraction verification failed: ${failures} issue(s).`);
  process.exit(1);
}
console.log(`Extraction verification passed: ${manifest.files.length} immutable file(s).`);

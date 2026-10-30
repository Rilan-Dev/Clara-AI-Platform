#!/usr/bin/env -S npx tsx
/**
 * Read-only, offline chunk-boundary canary: identical source/page evidence
 * through legacy vs opt-in section-aware chunking.
 *
 * This is NOT a tenant KB index, vector search, semantic relevance gate, or
 * authorization shortcut. It never calls an external provider or Qdrant.
 *
 * Usage:
 *   npx tsx scripts/rag-section-canary.ts
 *   npx tsx scripts/rag-section-canary.ts --fixture /private/canary.json \
 *     --chunk-size 280 --overlap 30 --out /private/canary-summary.json
 *
 * Fixture shape: {"pages":[{"pageNumber":2,"text":"..."}],
 *                 "requiredPhrases":["required short phrase",...]}
 * Output stores no document body, snippet, user IDs, or query text.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkDocumentWithPages } from "../src/modules/admin/core/ingest/chunker";

export type CanaryFixture = {
  pages: Array<{ pageNumber: number; text: string }>;
  requiredPhrases?: string[];
};
type Chunk = { text: string; pageNumber?: number };

const SYNTHETIC_REQS = [
  "define recovery activities and responsibilities",
  "identify operational priorities and dependencies",
  "establish recovery objectives and timelines",
  "document alternate resource requirements",
  "conduct recovery exercises and collect results",
  "review incidents and lessons learned",
  "approve and communicate the recovery plan",
];
export function syntheticFixture(): CanaryFixture {
  // Deliberately synthetic content, never a copy of the private policy KB.
  return {
    pages: [
      { pageNumber: 2, text:
        "DO.4.1 Data Backup and Restoration " +
        "Backup records shall be reviewed by the owner. ".repeat(3) +
        "DO.4.2 Disaster Recovery " +
        SYNTHETIC_REQS.map((text, i) => (i + 1) + ". The Entity shall " + text + ".").join(" ") },
      { pageNumber: 3, text:
        "DO.4.3 Production Access Management " +
        "Access changes shall be approved and validated by an independent reviewer. ".repeat(6) },
    ],
    requiredPhrases: SYNTHETIC_REQS,
  };
}

function validate(fixture: CanaryFixture): void {
  if (!fixture || !Array.isArray(fixture.pages) || fixture.pages.length === 0 ||
      fixture.pages.length > 500) throw new Error("Fixture must have 1..500 pages");
  for (const page of fixture.pages) {
    if (!Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1 ||
        typeof page.text !== "string" || !page.text.trim() ||
        page.text.length > 2_000_000)
      throw new Error("Invalid fixture page");
  }
  if (fixture.requiredPhrases !== undefined &&
      (!Array.isArray(fixture.requiredPhrases) ||
       fixture.requiredPhrases.length > 200 ||
       fixture.requiredPhrases.some(p => typeof p !== "string" || !p.trim() || p.length > 400)))
    throw new Error("Invalid requiredPhrases");
}
const HEADING = /\b[A-Z]{2,8}\.\d{1,3}(?:\.\d{1,3}){1,2}\s+(?=[A-Z][a-z]{2,}\b)/g;
function ids(text: string): string[] {
  return [...text.matchAll(HEADING)]
    .map(m => m[0].trim().split(/\s+/)[0]);
}
function unique<T>(a: T[]): T[] { return [...new Set(a)]; }

export function evaluateCanary(fixture: CanaryFixture, chunkSize = 280, overlap = 30) {
  validate(fixture);
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 100 || chunkSize > 10000 ||
      !Number.isSafeInteger(overlap) || overlap < 0 || overlap >= chunkSize)
    throw new Error("Invalid chunk size/overlap");
  const allText = fixture.pages.map(p => p.text).join("\n");
  const expected = unique(ids(allText));
  const required = fixture.requiredPhrases ?? [];
  const sourcePages = new Set(fixture.pages.map(p => p.pageNumber));
  const run = (sectionAware: boolean) => {
    const chunks: Chunk[] = chunkDocumentWithPages(
      { text: allText, pages: fixture.pages }, { chunkSize, overlap, sectionAware },
    );
    const lengths = chunks.map(c => c.text.length);
    const observed = unique(chunks.flatMap(c => ids(c.text)));
    const missingHeadingIds = expected.filter(id => !observed.includes(id));
    const missingPhrases = required.filter(p => !chunks.some(c => c.text.includes(p)));
    const pagesLost = chunks.filter(c => !sourcePages.has(c.pageNumber ?? -1)).length;
    const mixedHeadingChunks = chunks.filter(c => unique(ids(c.text)).length > 1).length;
    return {
      chunks: chunks.length,
      maxLength: Math.max(0, ...lengths),
      avgLength: chunks.length ? Math.round(lengths.reduce((a,b)=>a+b,0) / chunks.length) : 0,
      mixedHeadingChunks,
      missingHeadingCount: missingHeadingIds.length,
      coveredHeadings: expected.length - missingHeadingIds.length,
      missingRequiredPhraseCount: missingPhrases.length,
      coveredRequiredPhrases: required.length - missingPhrases.length,
      chunksWithoutSourcePage: pagesLost,
      allChunksWithinSize: lengths.every(x => x <= chunkSize),
    };
  };
  const baseline = run(false);
  const candidate = run(true);
  const gates = {
    headingCoverage: candidate.missingHeadingCount === 0,
    requirementPhraseCoverage: candidate.missingRequiredPhraseCount === 0,
    noMixedHeadingRegression: candidate.mixedHeadingChunks <= baseline.mixedHeadingChunks,
    pageProvenance: candidate.chunksWithoutSourcePage === 0,
    chunkLimit: candidate.allChunksWithinSize,
  };
  return {
    schemaVersion: 1,
    kind: "offline-rag-section-canary",
    source: "local-input-only",
    semanticRetrievalTested: false,
    vectorIndexTouched: false,
    productionKbTouched: false,
    sectionCount: expected.length,
    pageCount: fixture.pages.length,
    expectedPhraseCount: required.length,
    chunkSize, overlap, baseline, candidate, gates,
    passed: Object.values(gates).every(Boolean),
  };
}

function cli(argv: string[]): number {
  if (argv.includes("--help")) {
    console.log("Usage: npx tsx scripts/rag-section-canary.ts [--fixture path.json] [--chunk-size 280] [--overlap 30] [--out summary.json]");
    return 0;
  }
  const opts = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], val = argv[i + 1];
    if (!["--fixture", "--chunk-size", "--overlap", "--out"].includes(key) ||
        !val || val.startsWith("--") || opts.has(key)) throw new Error("Invalid CLI option");
    opts.set(key, val);
  }
  const file = opts.get("--fixture");
  const fixture = file ? JSON.parse(readFileSync(resolve(file), "utf8")) as CanaryFixture : syntheticFixture();
  const result = evaluateCanary(fixture,
    opts.has("--chunk-size") ? Number(opts.get("--chunk-size")) : 280,
    opts.has("--overlap") ? Number(opts.get("--overlap")) : 30);
  const serialized = JSON.stringify(result, null, 2) + "\n";
  if (opts.has("--out")) {
    const output = resolve(opts.get("--out")!);
    if (existsSync(output)) throw new Error("Refusing to overwrite an existing report");
    writeFileSync(output, serialized, { flag: "wx", mode: 0o600 });
  }
  console.log(serialized);
  console.log("Offline chunk integrity only. Semantic relevance, embeddings and KB authorization still require separate staging verification.");
  return result.passed ? 0 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = cli(process.argv.slice(2)); }
  catch (error) {
    // Avoid accidentally echoing local fixture paths/private source fragments.
    console.error("Offline canary failed: invalid fixture, options, or output file");
    process.exitCode = 1;
  }
}

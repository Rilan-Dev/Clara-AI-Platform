import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { loadWebPage, WebLoadError } from "../src/modules/admin/core/ingest/web-loader";

type ManifestEntry =
  | string
  | {
      url: string;
      label?: string;
      expectedMinChars?: number;
    };

type BenchmarkResult = {
  url: string;
  label: string;
  success: boolean;
  title?: string;
  chars?: number;
  strategy?: string;
  durationMs: number;
  error?: string;
  code?: string;
};

async function main() {
  const manifestArg = process.argv[2];
  if (!manifestArg) {
    console.error("Usage: npm run scrape:benchmark -- <manifest.json>");
    process.exit(1);
  }

  const manifestPath = resolve(process.cwd(), manifestArg);
  const raw = await readFile(manifestPath, "utf8");
  const entries = JSON.parse(raw) as ManifestEntry[];

  if (!Array.isArray(entries) || entries.length === 0) {
    console.error("Manifest must be a non-empty JSON array.");
    process.exit(1);
  }

  const results: BenchmarkResult[] = [];
  for (const entry of entries) {
    const url = typeof entry === "string" ? entry : entry.url;
    const label = typeof entry === "string"
      ? (basename(url) || url)
      : (entry.label ?? (basename(entry.url) || entry.url));
    const expectedMinChars = typeof entry === "string" ? 120 : (entry.expectedMinChars ?? 120);

    const start = Date.now();
    try {
      const doc = await loadWebPage(url);
      const durationMs = Date.now() - start;
      const chars = doc.text.trim().length;
      const success = chars >= expectedMinChars;
      results.push({
        url,
        label,
        success,
        title: doc.title,
        chars,
        strategy: doc.metadata.scrapeStrategy,
        durationMs,
        error: success ? undefined : `Content too short (${chars} chars < ${expectedMinChars})`,
        code: success ? undefined : "quality-reject",
      });
    } catch (error) {
      const durationMs = Date.now() - start;
      results.push({
        url,
        label,
        success: false,
        durationMs,
        error: (error as Error).message,
        code: error instanceof WebLoadError ? error.code : "unexpected",
      });
    }
  }

  const succeeded = results.filter((result) => result.success).length;
  const report = {
    generatedAt: new Date().toISOString(),
    manifestPath,
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    successRate: Number(((succeeded / results.length) * 100).toFixed(2)),
    results,
  };

  const outputDir = resolve(process.cwd(), ".sisyphus", "evidence");
  await mkdir(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, `scrape-benchmark-${Date.now()}.json`);
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nSaved report: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

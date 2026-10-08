import os from "node:os";

const SECRET_KEY_PATTERN =
  /(password|secret|token|api[_-]?key|auth[_-]?token|private[_-]?key|access[_-]?key|webhook)/i;

export type CliLog = Pick<typeof console, "log" | "warn" | "error">;

export type CliSummary = {
  startedAt: number;
  stages: number;
  completedStages: number;
  warnings: number;
  errors: number;
  created: number;
  updated: number;
  skipped: number;
};

export function maskSecret(value: string | undefined | null, visible = 4): string {
  if (!value) return "(not set)";
  if (value.length <= visible * 2) return "********";
  return `${value.slice(0, visible)}…${value.slice(-visible)}`;
}

export function safeValue(key: string, value: unknown): string {
  if (SECRET_KEY_PATTERN.test(key)) return maskSecret(String(value ?? ""));
  if (key.toLowerCase().includes("url") && typeof value === "string") {
    try {
      const url = new URL(value);
      if (url.username || url.password) {
        url.username = url.username ? maskSecret(url.username, 2) : "";
        url.password = url.password ? "********" : "";
        return url.toString();
      }
    } catch {
      // Fall through and print the non-URL value.
    }
  }
  return String(value ?? "(not set)");
}

export function printBanner(logger: CliLog, title: string): void {
  const line = "═".repeat(Math.max(58, title.length + 8));
  logger.log(`╔${line}╗`);
  logger.log(`║  ${title.padEnd(line.length - 4)}  ║`);
  logger.log(`╚${line}╝`);
}

export function printSection(
  logger: CliLog,
  area: string,
  title: string,
  details: Record<string, unknown> = {},
): void {
  logger.log(`\n[${area}][${title}]`);
  for (const [key, value] of Object.entries(details)) {
    logger.log(`  ${key.padEnd(20)}: ${safeValue(key, value)}`);
  }
}

export function createCliSummary(): CliSummary {
  return {
    startedAt: Date.now(),
    stages: 0,
    completedStages: 0,
    warnings: 0,
    errors: 0,
    created: 0,
    updated: 0,
    skipped: 0,
  };
}

export function stage(
  logger: CliLog,
  summary: CliSummary,
  area: string,
  title: string,
  details: Record<string, unknown> = {},
): { complete(details?: Record<string, unknown>): void; fail(error: unknown): void } {
  summary.stages += 1;
  const startedAt = Date.now();
  printSection(logger, area, title, details);

  return {
    complete(extra: Record<string, unknown> = {}) {
      summary.completedStages += 1;
      const duration = Date.now() - startedAt;
      logger.log(`  ✓ Completed in ${duration}ms`);
      for (const [key, value] of Object.entries(extra)) {
        logger.log(`    ${key.padEnd(18)}: ${safeValue(key, value)}`);
      }
    },
    fail(error: unknown) {
      summary.errors += 1;
      const duration = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`  ✗ Failed after ${duration}ms`);
      logger.error(`    Error              : ${message}`);
    },
  };
}

export function printRuntime(logger: CliLog, mode: string): void {
  printSection(logger, "SEED", "RUNTIME", {
    command: process.argv.slice(1).join(" "),
    mode,
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    hostname: os.hostname(),
    workingDirectory: process.cwd(),
  });
}

export function printSummary(logger: CliLog, summary: CliSummary, status: "SUCCESS" | "FAILED"): void {
  printSection(logger, "SEED", "SUMMARY", {
    status,
    duration: `${Date.now() - summary.startedAt}ms`,
    stages: `${summary.completedStages}/${summary.stages} completed`,
    created: summary.created,
    updated: summary.updated,
    skipped: summary.skipped,
    warnings: summary.warnings,
    errors: summary.errors,
  });
}

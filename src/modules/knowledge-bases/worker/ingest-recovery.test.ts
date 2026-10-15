/**
 * SQL-shape regression tests for the ingest queue recovery passes in
 * documents-db.ts.
 *
 * Covers the failure modes behind "documents stuck in pending forever, the
 * background worker never starts parsing":
 *   1. resetStaleIngestJobs must not reset attempts-exhausted running jobs
 *      back to 'pending' (they become unclaimable forever).
 *   2. finalizeUnclaimableIngestJobs must terminal-fail pending jobs with
 *      attempts >= max_attempts and fail their still-pending documents.
 *   3. failOrphanedProcessingDocuments must cover 'pending' documents and
 *      only treat claimable jobs (running, or pending with attempts left) as
 *      keeping a document alive.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => null),
  execute: vi.fn(async () => undefined),
  pool: { connect: vi.fn() },
}));

import { queryOne } from "@/lib/db";
import {
  failOrphanedProcessingDocuments,
  finalizeUnclaimableIngestJobs,
  resetStaleIngestJobs,
} from "@/modules/knowledge-bases/core/documents-db";

const queryOneMock = vi.mocked(queryOne);

function lastSql(): string {
  const calls = queryOneMock.mock.calls;
  const sql = calls[calls.length - 1]?.[0];
  return typeof sql === "string" ? sql : "";
}

beforeEach(() => {
  vi.clearAllMocks();
  queryOneMock.mockResolvedValue({ count: 0 });
});

describe("resetStaleIngestJobs", () => {
  it("sends attempts-exhausted stale running jobs to terminal 'failed', not 'pending'", async () => {
    await resetStaleIngestJobs(60_000);
    const sql = lastSql();
    expect(sql).toContain("CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END");
    expect(sql).toContain("status = 'running'");
    expect(sql).toContain("started_at < now()");
  });
});

describe("finalizeUnclaimableIngestJobs", () => {
  it("fails pending jobs with exhausted attempts and heals their documents", async () => {
    const count = await finalizeUnclaimableIngestJobs();
    expect(count).toBe(0);
    const sql = lastSql();
    expect(sql).toContain("ij.status = 'pending'");
    expect(sql).toContain("ij.attempts >= ij.max_attempts");
    // terminal state + completed_at
    expect(sql).toMatch(/SET status\s*=\s*'failed'/);
    // document heal: pending/processing docs of dead jobs become failed
    expect(sql).toContain("d.status IN ('pending', 'processing')");
    // ...unless another claimable job exists
    expect(sql).toContain("ij2.attempts < ij2.max_attempts");
  });

  it("reports the number of finalized jobs", async () => {
    queryOneMock.mockResolvedValue({ count: 2 });
    const count = await finalizeUnclaimableIngestJobs();
    expect(count).toBe(2);
  });
});

describe("failOrphanedProcessingDocuments", () => {
  it("covers pending documents, not only processing ones", async () => {
    await failOrphanedProcessingDocuments();
    const sql = lastSql();
    expect(sql).toContain("d.status IN ('pending', 'processing')");
  });

  it("treats only claimable jobs as keeping a document alive", async () => {
    await failOrphanedProcessingDocuments();
    const sql = lastSql();
    // running jobs keep the doc alive
    expect(sql).toContain("ij.status = 'running'");
    // pending jobs keep it alive ONLY while attempts remain (backoff included)
    expect(sql).toContain("ij.status = 'pending' AND ij.attempts < ij.max_attempts");
  });
});

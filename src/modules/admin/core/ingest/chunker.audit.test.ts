import { describe, expect, it } from "vitest";
import { auditLegacySectionChunks } from "../../../../../scripts/audit-rag-section-boundaries";

describe("read-only section-boundary audit", () => {
  it("counts pre-chunked excerpts crossing a standards control boundary", () => {
    const report = auditLegacySectionChunks([
      { text: "Recover backups and archives. DO.4.2 Disaster Recovery Assign incident roles.", documentId: "doc1" },
      { text: "DO.4.2 Disaster Recovery Assign roles. DO.4.3 Database Change Control Require approvals.", documentId: "doc1" },
      { text: "Routine explanatory material about policy but no headings.", documentId: "doc2" },
    ]);
    expect(report.sourceChunks).toBe(3);
    expect(report.documents).toBe(2);
    expect(report.headingBearingChunks).toBe(2);
    expect(report.chunksWithInternalHeading).toBe(2);
    expect(report.chunksWithMultipleHeadings).toBe(1);
    expect(report.legacyChunksCrossingDetectedBoundary).toBe(2);
    expect(report.detectedBoundaryCrossingRate).toBe(0.6667);
    expect(report.segmentsAfterResplitting).toBeGreaterThanOrEqual(5);
    expect(report.limitation).toMatch(/cannot reconstruct original document/);
  });

  it("does not mistake inline references lacking heading titles for sections", () => {
    const report = auditLegacySectionChunks([
      { text: "Please review DO.4.2 after the audit, then continue." },
      { text: "SEC.3.1 Access Control Requirements include review dates." },
    ]);
    expect(report.legacyChunksCrossingDetectedBoundary).toBe(0);
    expect(report.headingBearingChunks).toBe(1);
  });

  it("handles an empty set deterministically, without printing private records", () => {
    const report = auditLegacySectionChunks([]);
    expect(report.sourceChunks).toBe(0);
    expect(report.detectedBoundaryCrossingRate).toBe(0);
  });
});

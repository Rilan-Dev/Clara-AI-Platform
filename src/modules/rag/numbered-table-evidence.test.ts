import { describe, expect, it } from "vitest";
import { detectNumberedTableIntent, selectNumberedTableEvidence } from "./numbered-table-evidence";
const point = (id: string, documentId: string, chunkIndex: number, text: string) =>
  ({ id, payload: { documentId, chunkIndex, chunk: text, title: "Test PDF" } });

describe("fully-scoped source summary table recovery", () => {
  it("recognizes explicit all-N lists without naming any industry", () => {
    expect(detectNumberedTableIntent("What are all 15 domains?")).toEqual({ count: 15, subject: "domains" });
    expect(detectNumberedTableIntent("List every 20 categories")).toEqual({ count: 20, subject: "categories" });
    expect(detectNumberedTableIntent("Name the domains")).toBeNull();
    expect(detectNumberedTableIntent("List all 0 domains")).toBeNull();
  });
  it("brings the second page of a table into the same answer while keeping provenance", () => {
    const points = [
      point("a", "en", 40, "Summarized across 15 domains: ID Domain # of Controls 1 Alpha 8 2 Beta 6 9 Ninth 8"),
      point("b", "en", 41, "10 Tenth 4 11 Eleventh 3 15 Fifteenth 1"),
      point("c", "en", 42, "8.2. Implementation Plan: unrelated"),
      point("d", "other", 41, "Private unrelated cross-tenant material"),
      point("ar", "ar", 37, "ملخص المجالات الـ 15 : الرقم المجال 1 حوكمة البيانات 2 جودة البيانات 15 أمن البيانات"),
    ];
    const selected = selectNumberedTableEvidence(points, { count: 15, subject: "domains" }, "List all 15 domains");
    expect(selected.map(p => p.id)).toEqual(["a","b"]);
    expect(selected.map(p => p.text).join(" ")).not.toContain("Private unrelated");
    const arabic = selectNumberedTableEvidence(points, { count: 15, subject: "domains" }, "ما هي المجالات الـ 15؟");
    expect(arabic.map(p=>p.id)).toEqual(["ar"]);
  });
  it("refuses an unanchored or missing number rather than guessing", () => {
    const points = [point("a","one",1,"List of some controls"),point("b","one",2,"1 Alpha 2 Beta")];
    expect(selectNumberedTableEvidence(points,{count:15,subject:"domains"},"all 15 domains")).toEqual([]);
  });
});

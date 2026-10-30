import { describe, expect, it } from "vitest";
import { buildReferenceWindows, REFERENCE_SCAN_LIMIT, type ReferencePoint } from "./reference-recovery";

function point(id: string, documentId: string, chunkIndex: number, chunk: string): ReferencePoint {
  return { id, payload: { documentId, chunkIndex, chunk } };
}

describe("bounded exact-clause recovery and multi-chunk continuity", () => {
  const rows: ReferencePoint[] = [
    point("a", "arabic", 110, "DO.4.1 Old requirement.\nDO.4.2 Disaster recovery: 1. prioritise information systems"),
    point("b", "arabic", 111, "Overlap before clause.\nDO.4.2 Disaster recovery: 1. priority 2. owners 3. response"),
    point("c", "arabic", 112, "70 4. Reduce consequences 5. RPO objectives 6. RTO objectives 7. recovery activities\nDO.4.3 Production changes unrelated"),
    point("d", "arabic", 113, "DO.4.3 Rules must not appear in prior control's evidence"),
    point("x", "other", 4, "DO.2.1 unrelated to disaster recovery"),
  ];

  it("recovers a control and its numbered continuation without the next clause", () => {
    const windows = buildReferenceWindows(rows, "List ALL items for DO.4.2", 6);
    expect(windows.map((w) => w.id)).toEqual(["a", "b", "c"]);
    expect(windows[0]!.text).toMatch(/^DO\.4\.2/);
    expect(windows[1]!.text).toMatch(/^DO\.4\.2/);
    expect(windows[2]!.text).toContain("7. recovery activities");
    expect(windows.map((w) => w.text).join("\n")).not.toContain("DO.4.3");
    expect(windows.every((w) => w.documentId === "arabic")).toBe(true);
  });

  it("keeps adjacent chunks within the same document and refuses a gap in indexes", () => {
    const windows = buildReferenceWindows([
      point("start", "one", 3, "SYS-4.2 Numbered requirements 1 2 3"),
      point("wrong-doc", "other", 4, "4 5 6 7. another customer's material"),
      point("gap", "one", 5, "4 5 6 7 after a missing chunk"),
    ], "SYS-4.2", 6);
    expect(windows.map((w) => w.id)).toEqual(["start"]);
  });

  it("never includes a longer similarly named identifier", () => {
    const windows = buildReferenceWindows([
      point("false", "one", 1, "DO.4.21 should not match DO.4.2 without boundaries"),
    ], "DO.4.2", 3);
    // The second DO.4.2 in the synthetic string is an exact reference.
    expect(windows.map((w) => w.id)).toEqual(["false"]);
    expect(windows[0]?.text).toBe("DO.4.2 without boundaries");
    expect(buildReferenceWindows([
      point("only-long", "one", 1, "DO.4.21 is a different requirement"),
    ], "DO.4.2", 3)).toEqual([]);
  });

  it("budgets chunks across documents without blending tenant references", () => {
    const windows = buildReferenceWindows([
      point("en1", "english", 4, "DO.4.2: explanation"),
      point("en2", "english", 5, "4 5 6 7"),
      point("ar1", "arabic", 11, "DO.4.2: تفاصيل"),
      point("ar2", "arabic", 12, "4 5 6 7"),
    ], "DO.4.2", 3);
    expect(windows.map((w) => w.id)).toEqual(["en1", "ar1", "en2"]);
  });

  it("retains an immediately preceding priority tag without leaking prior control text", () => {
    const rows = [
      point("ar", "arabic", 110,
        "DO.4.1 previous backup instructions. أولوية 2 DO.4.2 التعافي من الكوارث: 1. أنظمة المعلومات"),
      point("en", "english", 122,
        "DO.4.1 old backup instructions. P2 DO.4.2 Disaster Recovery: 1. system priorities"),
      point("far", "other", 6,
        "P3 previous content with lots of unrelated words. DO.4.2 Disaster Recovery"),
    ];
    const windows = buildReferenceWindows(rows, "What priority is DO.4.2?", 6);
    expect(windows.find(w => w.id === "ar")?.text).toMatch(/أولوية 2\\s+DO\\.4\\.2/);
    expect(windows.find(w => w.id === "en")?.text).toMatch(/P2\\s+DO\\.4\\.2/);
    expect(windows.find(w => w.id === "far")?.text).toMatch(/^DO\\.4\\.2/);
    expect(windows.map(w => w.text).join(" ")).not.toContain("old backup instructions");
  });

  it("does not trigger lexical recovery on ordinary questions", () => {
    expect(buildReferenceWindows(rows, "What are your opening hours?", 6)).toEqual([]);
    expect(REFERENCE_SCAN_LIMIT).toBeLessThanOrEqual(2048);
  });
});

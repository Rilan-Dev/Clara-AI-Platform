import { describe, expect, it } from "vitest";
import { detectIdentifierInventoryIntent, buildIdentifierInventory, formatIdentifierInventory } from "./identifier-inventory";

describe("format-agnostic exhaustive identifier inventory", () => {
  it("detects explicit enumeration intent without any fixed industry prefix", () => {
    expect(detectIdentifierInventoryIntent("List all DO policies")).toEqual({ prefix: "DO" });
    expect(detectIdentifierInventoryIntent("Can you list all T0 policies?")).toEqual({ prefix: "T0" });
    expect(detectIdentifierInventoryIntent("Show every ISO controls")).toEqual({ prefix: "ISO" });
    expect(detectIdentifierInventoryIntent("Which DO.4.2 control?")).toBeNull();
    expect(detectIdentifierInventoryIntent("What policies are available?")).toBeNull();
    expect(detectIdentifierInventoryIntent("List all the controls")).toBeNull();
  });
  it("returns all identifiers from authorized, fully scanned chunks in numeric order", () => {
    const pts = [
      { id: "a", payload: { documentId: "doc1", title: "Test", chunk: "DO.4.2 disaster recovery requirements", pageNumber: 70 } },
      { id: "b", payload: { documentId: "doc1", title: "Test", chunk: "DO.2.1 storage DO.1.4 retention" } },
      { id: "c", payload: { documentId: "doc2", title: "Other", chunk: "DO.1.10 plan; DO.1.4 duplicate; XX.1.1 irrelevant" } },
    ];
    const result = buildIdentifierInventory(pts, { prefix: "DO" }, true);
    expect(result.complete).toBe(true);
    expect(result.entries.map(x=>x.identifier)).toEqual(["DO.1.4","DO.1.10","DO.2.1","DO.4.2"]);
    expect(formatIdentifierInventory("DO", result)).toContain("4 distinct DO identifiers");
    expect(formatIdentifierInventory("DO", result)).toContain("page 70");
  });
  it("labels grouping prefixes separately from individually numbered specifications", () => {
    const points = [
      { id: "a", payload: { chunk: "DO.1 section DO.1.1 item DO.1.2 item" } },
      { id: "b", payload: { chunk: "DO.2 section DO.2.1 item" } },
    ];
    const report = buildIdentifierInventory(points, { prefix: "DO" }, true);
    const text = formatIdentifierInventory("DO", report);
    expect(text).toContain("3 leaf identifiers and 2 parent/group identifiers");
    expect(text).toContain("Leaf DO.1.1");
    expect(text).toContain("Parent DO.1");
    expect(text).not.toContain("Leaf DO.1 —");
  });

  it("never declares exhaustive results when a scroll is partial, too large or mismatched", () => {
    const pts = [{ id: "1", payload: { chunk: "DO.1.1", referenceIds: ["DO.1.1", "HR.2.1"] } }];
    expect(buildIdentifierInventory(pts, { prefix: "DO" }, false).complete).toBe(false);
    expect(buildIdentifierInventory(pts, { prefix: "DO" }, true, 0).overflow).toBe(true);
    expect(buildIdentifierInventory(pts, { prefix: "T0" }, true).entries).toEqual([]);
  });
});

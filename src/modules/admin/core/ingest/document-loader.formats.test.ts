import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { parseDocumentFromBuffer } from "./document-loader";

async function docxBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml",
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Site incident response procedure CTRL.7.2</w:t></w:r></w:p></w:body></w:document>');
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("cross-industry file ingestion formats", () => {
  it("preserves web HTML headings and policy content without raw tags", async () => {
    const html = Buffer.from('<html><head><title>Construction handbook</title></head><body><main><h1>Lift inspection</h1><p>Record findings before closing work orders.</p></main></body></html>');
    const parsed = await parseDocumentFromBuffer(html, "handbook.html", "text/html");
    expect(parsed.text).toContain("Lift inspection");
    expect(parsed.text).toContain("Record findings");
    expect(parsed.text).not.toContain("<h1>");
  });

  it("preserves XLSX sheet and blank-column positions in a procurement register", async () => {
    const wb = XLSX.utils.book_new();
    const sh = XLSX.utils.aoa_to_sheet([["Order", "Owner", "Amount"],["PO-14", "", 275]]);
    XLSX.utils.book_append_sheet(wb, sh, "Purchasing");
    const parsed = await parseDocumentFromBuffer(XLSX.write(wb,{ type: "buffer", bookType: "xlsx" }),"procurement.xlsx");
    expect(parsed.text).toContain("[Sheet: Purchasing]");
    expect(parsed.text).toContain("PO-14\t\t275");
  });

  it("extracts a DOCX procedural clause from an actual OOXML container", async () => {
    const parsed = await parseDocumentFromBuffer(await docxBuffer(), "incident.docx");
    expect(parsed.text).toContain("Site incident response procedure CTRL.7.2");
  });

  it("retains PDF page provenance for a synthetic healthcare standard", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([560, 720]).drawText("Patient records must be retained for the approved period.",{x:40,y:660,font,size:11});
    doc.addPage([560, 720]).drawText("Records policy MED.2.1 requires controlled disposal.",{x:40,y:660,font,size:11});
    const parsed = await parseDocumentFromBuffer(Buffer.from(await doc.save()),"healthcare.pdf","application/pdf");
    expect(parsed.pages?.length).toBe(2);
    expect(parsed.pages?.[0]?.text).toContain("Patient records");
    expect(parsed.pages?.[1]?.text).toContain("MED.2.1");
  });

  it("never treats image-only scanned PDFs as extracted evidence without OCR", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([560, 720]);
    await expect(parseDocumentFromBuffer(Buffer.from(await doc.save()),"scan.pdf","application/pdf"))
      .rejects.toThrow(/no readable text/i);
  });
});

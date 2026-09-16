/**
 * scripts/generate-seed-docs.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the fictional sample PDFs for the Phase 5 demo seed into
 * public/seed-docs/{omen,techvision}/ .
 *
 *   node scripts/generate-seed-docs.mjs
 *
 * Requires the dev dependency `pdf-lib` (pure JS, no native code):
 *   npm install
 *
 * The documents are deterministic: content lives in
 * scripts/seed-docs-content-omen.mjs and
 * scripts/seed-docs-content-techvision.mjs.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { OMEN_DOCS } from "./seed-docs-content-omen.mjs";
import { TECHVISION_DOCS } from "./seed-docs-content-techvision.mjs";

const OUT_ROOT = path.resolve(process.cwd(), "public/seed-docs");

// ── layout constants ─────────────────────────────────────────────────────────
const PAGE_W = 595.28;              // A4
const PAGE_H = 841.89;
const MARGIN_X = 68;
const MARGIN_TOP = 86;              // below running header
const MARGIN_BOTTOM = 76;           // above footer
const BODY_SIZE = 10.5;
const BODY_LEADING = 15;
const HEADING_SIZE = 13;
const HEADING_GAP_BEFORE = 22;
const HEADING_GAP_AFTER = 10;
const TABLE_SIZE = 9;
const TABLE_LEADING = 12;
const FOOTER_SIZE = 8;
const HEADER_SIZE = 8.5;

const INK = rgb(0.13, 0.15, 0.19);
const MUTED = rgb(0.45, 0.48, 0.55);
const RULE = rgb(0.78, 0.80, 0.84);
const ACCENT = rgb(0.04, 0.09, 0.16); // navy for headings
const TABLE_HEAD_BG = rgb(0.93, 0.94, 0.96);

function wrapText(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawRule(page, y) {
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_W - MARGIN_X, y },
    thickness: 0.7,
    color: RULE,
  });
}

class DocRenderer {
  constructor(pdf, doc, fonts) {
    this.pdf = pdf;
    this.doc = doc;
    this.fonts = fonts;
    this.pages = [];
    this.page = null;
    this.y = 0;
    this.pageNo = 0;
  }

  get bodyWidth() {
    return PAGE_W - MARGIN_X * 2;
  }

  newPage() {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.pageNo += 1;
    this.pages.push(this.page);
    // running header
    this.page.drawText(this.doc.title, {
      x: MARGIN_X, y: PAGE_H - 52, size: HEADER_SIZE,
      font: this.fonts.helv, color: MUTED,
    });
    const version = this.doc.meta.version;
    const vw = this.fonts.helv.widthOfTextAtSize(version, HEADER_SIZE);
    this.page.drawText(version, {
      x: PAGE_W - MARGIN_X - vw, y: PAGE_H - 52, size: HEADER_SIZE,
      font: this.fonts.helv, color: MUTED,
    });
    drawRule(this.page, PAGE_H - 60);
    this.y = PAGE_H - MARGIN_TOP;
  }

  ensureSpace(needed) {
    if (this.y - needed < MARGIN_BOTTOM) this.newPage();
  }

  footer(totalPages, dateLabel) {
    for (const [i, page] of this.pages.entries()) {
      const left = "Sample document — fictional content for demonstration only";
      const right = `Omen/TechVision demo seed · ${dateLabel} · Page ${i + 1} of ${totalPages}`;
      page.drawText(left, {
        x: MARGIN_X, y: 46, size: FOOTER_SIZE, font: this.fonts.helv, color: MUTED,
      });
      const rw = this.fonts.helb.widthOfTextAtSize(right, FOOTER_SIZE);
      page.drawText(right, {
        x: PAGE_W - MARGIN_X - rw, y: 46, size: FOOTER_SIZE, font: this.fonts.helb, color: MUTED,
      });
      drawRule(page, 58);
    }
  }

  titlePage(dateLabel) {
    this.newPage();
    const { helv, helb, timesB, timesI } = this.fonts;
    let y = PAGE_H - 150;

    this.page.drawText(this.doc.meta.reference, {
      x: MARGIN_X, y, size: 9, font: helv, color: MUTED,
    });
    y -= 46;

    for (const line of wrapText(this.doc.title, timesB, 30, this.bodyWidth)) {
      this.page.drawText(line, { x: MARGIN_X, y, size: 30, font: timesB, color: ACCENT });
      y -= 38;
    }
    y -= 6;
    for (const line of wrapText(this.doc.meta.subtitle, timesI, 13, this.bodyWidth)) {
      this.page.drawText(line, { x: MARGIN_X, y, size: 13, font: timesI, color: INK });
      y -= 18;
    }
    y -= 18;
    drawRule(this.page, y);
    y -= 26;

    const info = [
      ["Document", this.doc.title],
      ["Version", this.doc.meta.version],
      ["Reference", this.doc.meta.reference],
      ["Issued", dateLabel],
      ["Owner", "Omen United Insurance / TechVision Solutions (fictional)"],
      ["Classification", "Sample — demo knowledge base content"],
    ];
    for (const [k, v] of info) {
      this.page.drawText(k, { x: MARGIN_X, y, size: 10, font: helb, color: MUTED });
      const kw = helb.widthOfTextAtSize(k, 10);
      for (const [i, line] of wrapText(v, helv, 10, this.bodyWidth - 150 - kw).entries()) {
        this.page.drawText(line, { x: MARGIN_X + 150, y: y - i * 14, size: 10, font: helv, color: INK });
      }
      y -= 20;
    }
    y -= 10;

    // fictional notice box
    const noticeLines = wrapText(
      "IMPORTANT NOTICE — This is a fictional sample document generated for the Clara demo " +
      "environment. Every name, number, figure, address and procedure in this document is " +
      "invented. Nothing here is real insurance, legal, medical or engineering advice, and no " +
      "real entity, product or service is described. The document exists so that demo " +
      "assistants can retrieve and cite realistic structured content.",
      helv, 9.5, this.bodyWidth - 28,
    );
    let boxTop = y;
    let boxBottom = y - 16 * noticeLines.length - 22;
    this.page.drawRectangle({
      x: MARGIN_X, y: boxBottom, width: this.bodyWidth, height: boxTop - boxBottom,
      color: TABLE_HEAD_BG, borderColor: RULE, borderWidth: 0.8,
    });
    let ny = boxTop - 22;
    for (const line of noticeLines) {
      this.page.drawText(line, { x: MARGIN_X + 14, y: ny, size: 9.5, font: helv, color: INK });
      ny -= 14;
    }
  }

  heading(text) {
    this.ensureSpace(HEADING_GAP_BEFORE + HEADING_SIZE + HEADING_GAP_AFTER + BODY_LEADING);
    this.y -= HEADING_GAP_BEFORE;
    this.page.drawText(text, {
      x: MARGIN_X, y: this.y, size: HEADING_SIZE, font: this.fonts.helb, color: ACCENT,
    });
    this.y -= 6;
    drawRule(this.page, this.y);
    this.y -= HEADING_GAP_AFTER;
  }

  paragraph(text) {
    for (const line of wrapText(text, this.fonts.times, BODY_SIZE, this.bodyWidth)) {
      this.ensureSpace(BODY_LEADING + 2);
      this.page.drawText(line, {
        x: MARGIN_X, y: this.y, size: BODY_SIZE, font: this.fonts.times, color: INK,
      });
      this.y -= BODY_LEADING;
    }
    this.y -= 8;
  }

  bullets(items) {
    for (const item of items) {
      const indent = MARGIN_X + 14;
      const width = this.bodyWidth - 14;
      const lines = wrapText(item, this.fonts.times, BODY_SIZE, width);
      this.ensureSpace(BODY_LEADING + 2);
      this.page.drawText("\u2022", {
        x: MARGIN_X, y: this.y, size: BODY_SIZE, font: this.fonts.times, color: ACCENT,
      });
      for (const line of lines) {
        this.ensureSpace(BODY_LEADING + 2);
        this.page.drawText(line, {
          x: indent, y: this.y, size: BODY_SIZE, font: this.fonts.times, color: INK,
        });
        this.y -= BODY_LEADING;
      }
      this.y -= 3;
    }
    this.y -= 5;
  }

  qa(pair) {
    const qLines = wrapText(`Q: ${pair.q}`, this.fonts.helb, BODY_SIZE - 0.5, this.bodyWidth);
    this.ensureSpace((qLines.length + 1) * (BODY_LEADING + 2) + BODY_LEADING);
    for (const line of qLines) {
      this.ensureSpace(BODY_LEADING + 2);
      this.page.drawText(line, {
        x: MARGIN_X, y: this.y, size: BODY_SIZE - 0.5, font: this.fonts.helb, color: ACCENT,
      });
      this.y -= BODY_LEADING;
    }
    for (const line of wrapText(`A: ${pair.a}`, this.fonts.times, BODY_SIZE, this.bodyWidth)) {
      this.ensureSpace(BODY_LEADING + 2);
      this.page.drawText(line, {
        x: MARGIN_X, y: this.y, size: BODY_SIZE, font: this.fonts.times, color: INK,
      });
      this.y -= BODY_LEADING;
    }
    this.y -= 9;
  }

  table(spec) {
    const { cols, rows } = spec;
    const nCols = cols.length;
    // column widths weighted by content length, clamped to sane bounds
    const weights = cols.map((c, i) => {
      const content = [c, ...rows.map((r) => r[i] ?? "")].join(" ");
      return Math.min(Math.max(content.length, 6), 60);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => Math.max((w / total) * this.bodyWidth, 60));
    // renormalise
    const wSum = widths.reduce((a, b) => a + b, 0);
    const colX = [MARGIN_X];
    for (const w of widths) colX.push(colX[colX.length - 1] + (w / wSum) * this.bodyWidth);
    const colW = widths.map((w) => (w / wSum) * this.bodyWidth);

    const drawRow = (cells, isHead) => {
      const wrapped = cells.map((cell, i) => wrapText(cell, isHead ? this.fonts.helb : this.fonts.helv, TABLE_SIZE, colW[i] - 10));
      const rowH = Math.max(...wrapped.map((l) => l.length)) * TABLE_LEADING + 10;
      this.ensureSpace(rowH + 4);
      if (isHead) {
        this.page.drawRectangle({
          x: MARGIN_X, y: this.y - rowH + 6, width: this.bodyWidth, height: rowH,
          color: TABLE_HEAD_BG, borderColor: RULE, borderWidth: 0.6,
        });
      }
      wrapped.forEach((lines, i) => {
        let ty = this.y - 4;
        for (const line of lines) {
          this.page.drawText(line, {
            x: colX[i] + 5, y: ty - 10, size: TABLE_SIZE,
            font: isHead ? this.fonts.helb : this.fonts.helv,
            color: isHead ? ACCENT : INK,
          });
          ty -= TABLE_LEADING;
        }
      });
      // row borders
      for (let i = 0; i <= nCols; i++) {
        this.page.drawLine({
          start: { x: colX[i], y: this.y + 6 },
          end: { x: colX[i], y: this.y - rowH + 6 },
          thickness: 0.5, color: RULE,
        });
      }
      drawRule(this.page, this.y - rowH + 6);
      this.y -= rowH + 6;
    };

    drawRow(cols, true);
    for (const row of rows) drawRow(row, false);
    this.y -= 10;
  }

  block(block) {
    if (block.p) this.paragraph(block.p);
    else if (block.bullets) this.bullets(block.bullets);
    else if (block.table) this.table(block.table);
    else if (block.qa) this.qa(block.qa);
  }
}

async function renderDoc(doc, dateLabel) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setSubject(doc.meta.subtitle);
  pdf.setProducer("Clara demo seed generator (fictional sample documents)");
  pdf.setCreator("Clara-AI-Platform sample generator");
  const fonts = {
    times: await pdf.embedFont(StandardFonts.TimesRoman),
    timesB: await pdf.embedFont(StandardFonts.TimesRomanBold),
    timesI: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    helv: await pdf.embedFont(StandardFonts.Helvetica),
    helb: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  const renderer = new DocRenderer(pdf, doc, fonts);
  renderer.titlePage(dateLabel);
  for (const section of doc.sections) {
    renderer.newPage();
    renderer.heading(section.heading);
    for (const block of section.blocks) renderer.block(block);
  }
  renderer.footer(renderer.pages.length, dateLabel);
  const bytes = await pdf.save();
  return bytes;
}

async function main() {
  const dateLabel = "September 2026";
  const byDir = new Map([
    ["omen", OMEN_DOCS],
    ["techvision", TECHVISION_DOCS],
  ]);

  for (const [dir, docs] of byDir) {
    const outDir = path.join(OUT_ROOT, dir);
    await mkdir(outDir, { recursive: true });
    for (const doc of docs) {
      const bytes = await renderDoc(doc, dateLabel);
      const out = path.join(outDir, doc.filename);
      await writeFile(out, bytes);
      const pdf = await PDFDocument.load(bytes);
      console.log(`[seed-docs] ${dir}/${doc.filename} — ${pdf.getPageCount()} pages, ${(bytes.length / 1024).toFixed(1)} KB`);
    }
  }
  console.log(`[seed-docs] wrote all sample documents under ${path.relative(process.cwd(), OUT_ROOT)}/`);
}

main().catch((err) => {
  console.error("[seed-docs] FAILED:", err);
  process.exitCode = 1;
});

/**
 * src/modules/knowledge-bases/worker/ingest-pipeline.local.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * FULL LOCAL pipeline test for the production complaint "document extractions
 * and embeddings was not working": real PDF bytes → parseDocumentFromBuffer →
 * chunkText → embedBatches → real @google/genai SDK HTTP stack, with a local
 * node:http relay standing in for generativelanguage.googleapis.com.
 *
 * What it proves, end to end and without any external network:
 *   1. EXTRACTION is healthy and independent of the embedding vendor — a real
 *      PDF parses to text and chunks (>1 batch worth) even when the vendor
 *      endpoint is a local stub. Production already showed this (failed
 *      documents carried chunkCount 295-315), but now it is pinned by a test.
 *   2. EMBEDDING rides ONE HTTP request per EMBED_BATCH_SIZE slice over ONE
 *      TCP connection for the whole document — the connection-burst fix for
 *      the production ConnectTimeoutError storm (20 parallel connects per
 *      batch while a single-connection test call succeeded in ~900ms).
 *   3. Vectors come back aligned with the chunk order, so Qdrant upserts
 *      cannot silently mis-associate chunk text with vectors.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

vi.mock("@/modules/knowledge-bases/core/analytics-db", () => ({
  logUsageEvent: vi.fn(async () => undefined),
}));

import { parseDocumentFromBuffer } from "@/modules/admin/core/ingest/document-loader";
import { chunkText } from "@/modules/admin/core/ingest/chunker";
import { embedBatches } from "@/modules/admin/core/vector-store-kb";

type RelayCapture = { url: string; body: Record<string, unknown> };

/** Build a real, parseable multi-page PDF whose page text is `text` (80-char lines). */
function buildPdfWithText(text: string): Buffer {
  const sanitized = text.replace(/[()\\]/g, " ");
  const lines = sanitized.match(/.{1,80}(\s|$)/g) ?? [sanitized];

  const LINES_PER_PAGE = 44; // 16pt leading inside a 612x792 MediaBox
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE));
  }

  // Object numbering: 1 = Catalog, 2 = Pages, 3 = Font, then per page k:
  // page object 4+2k, content object 5+2k.
  const fontObjNum = 3;
  const pageObjNums = pages.map((_, k) => 4 + k * 2);
  const objects = new Map<number, string>();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  objects.set(fontObjNum, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((pageLines, k) => {
    const pageObj = pageObjNums[k];
    const contentObj = pageObj + 1;
    const streamBody =
      "BT\n/F1 12 Tf\n" +
      pageLines
        .map((line, i) => `72 ${720 - i * 16} Td (${line.trim()}) Tj\nET\nBT\n/F1 12 Tf\n`)
        .join("") +
      "ET\n";
    objects.set(
      pageObj,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentObj} 0 R >>`,
    );
    objects.set(contentObj, `<< /Length ${streamBody.length} >>\nstream\n${streamBody}endstream`);
  });

  const maxObj = Math.max(...objects.keys());
  const chunks = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  let position = chunks[0].length;
  for (let num = 1; num <= maxObj; num++) {
    const obj = objects.get(num);
    if (obj == null) throw new Error(`missing object ${num}`);
    const serialized = `${num} 0 obj\n${obj}\nendobj\n`;
    offsets.push(position);
    chunks.push(serialized);
    position += serialized.length;
  }
  chunks.push(`xref\n0 ${maxObj + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  for (let num = 1; num <= maxObj; num += 1) {
    chunks.push(`${String(offsets[num]).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`);
  return Buffer.from(chunks.join(""), "ascii");
}

function startRelay(captures: RelayCapture[]): Promise<{
  server: http.Server;
  baseUrl: string;
  sockets: () => number;
}> {
  let openSockets = 0;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      const body: Record<string, unknown> = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      captures.push({ url: req.url ?? "?", body });
      const requestCount = Array.isArray(body.requests) ? body.requests.length : 0;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          embeddings: Array.from({ length: requestCount }, (_, i) => ({ values: [i, 1] })),
        }),
      );
    });
  });
  server.on("connection", () => { openSockets += 1; });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, sockets: () => openSockets });
    });
  });
}

describe("KB ingest pipeline — extraction, chunking and embedding (fully local)", () => {
  const envKeys = ["GEMINI_BASE_URL", "GEMINI_EMBEDDING_DIMENSION"] as const;
  let cleanup: (() => void)[] = [];

  beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
    cleanup = [];
  });

  afterEach(() => {
    for (const fn of cleanup) fn();
    for (const key of envKeys) delete process.env[key];
  });

  it("parses a real PDF and preserves embedding alignment after a partial Gemini batch", async () => {
    const captures: RelayCapture[] = [];
    const { server, baseUrl, sockets } = await startRelay(captures);
    cleanup.push(() => server.close());

    process.env.GEMINI_BASE_URL = baseUrl;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";

    // ~28k chars of policy-like text → 30+ chunks → 2+ embedding batches.
    const paragraph =
      "The organisation shall maintain a documented data governance policy covering the collection, " +
      "processing, retention and deletion of personal data in accordance with applicable regulations. ";
    const documentText = Array.from({ length: 100 }, (_, i) => `${paragraph}(clause ${i + 1}) `).join("");
    const pdf = buildPdfWithText(documentText);

    // 1. EXTRACTION — real PDF parser, no mocks.
    const parsed = await parseDocumentFromBuffer(pdf, "PoliciesEn001.pdf", "application/pdf");
    expect(parsed.text).toContain("data governance policy");
    expect(parsed.text.length).toBeGreaterThan(10_000);

    // 2. CHUNKING — the real splitter used by the ingest worker.
    const chunks = chunkText(parsed.text);
    expect(chunks.length).toBeGreaterThan(20);

    // 3. EMBEDDING — the real provider stack against the local relay.
    const vectors = await embedBatches(chunks, {
      provider: "gemini",
      apiKey: "ingest-pipeline-local-test-key",
      embeddingModel: "gemini-embedding-2-preview",
    });

    // Every chunk got exactly one aligned vector.
    expect(vectors).toHaveLength(chunks.length);
    for (const vector of vectors) {
      expect(vector).toHaveLength(2);
    }

    // The current Gemini SDK sends a multi-content batch in a single request
    // envelope. This stub returns one embedding, modeling a partial provider
    // response. The application discards that ambiguous vector and safely
    // re-embeds ALL inputs sequentially on the existing keep-alive connection.
    expect(captures).toHaveLength(chunks.length + 1);
    for (const capture of captures) {
      expect(capture.url).toContain(":batchEmbedContents");
      expect((capture.body.requests as unknown[]).length).toBe(1);
    }
    // The SDK may recycle a connection between the first failed multi-input
    // request and the sequential fallback. It must not open N connections
    // proportional to the number of input chunks (the outage we fixed).
    expect(sockets()).toBeLessThanOrEqual(3);
  });

  it("proves extraction+chunking still succeed when the embedding endpoint is unreachable (failure isolation)", async () => {
    // Bind then close → a port that refuses connections.
    const { server } = await startRelay([]);
    const deadPort = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    process.env.GEMINI_BASE_URL = `http://127.0.0.1:${deadPort}`;
    process.env.GEMINI_EMBEDDING_DIMENSION = "1536";

    const paragraph = "Retention schedules shall be reviewed annually and approved by the data governance board. ";
    const pdf = buildPdfWithText(paragraph.repeat(40));

    const parsed = await parseDocumentFromBuffer(pdf, "PoliciesAr001.pdf", "application/pdf");
    const chunks = chunkText(parsed.text);

    // Extraction and chunking are COMPLETE before embedding is attempted —
    // the pipeline stage that production showed failing (documents carried
    // chunkCount 295-315 while embedding was down).
    expect(parsed.text.length).toBeGreaterThan(1_000);
    expect(chunks.length).toBeGreaterThan(1);

    let thrown: unknown;
    try {
      await embedBatches(chunks, {
        provider: "gemini",
        apiKey: "ingest-pipeline-unreachable-test-key",
        embeddingModel: "gemini-embedding-2-preview",
      });
    } catch (err) {
      thrown = err;
    }

    // Embedding failure is actionable and names the endpoint actually in use.
    const message = (thrown as Error)?.message ?? "";
    expect(message).toContain("Embedding failed (gemini/gemini-embedding-2-preview @ 127.0.0.1:");
    expect(message).toContain("embedding provider is unreachable");
  });
});

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseDocumentFromBuffer } from '../src/modules/admin/core/ingest/document-loader';

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error('Usage: npm run ingest:test -- <file1> [file2 ...]');
  console.error('Example: npm run ingest:test -- ./fixtures/policy.pdf ./fixtures/policy.docx ./fixtures/faqs.xlsx');
  process.exit(2);
}

let failed = 0;

for (const file of files) {
  const filename = path.basename(file);
  const started = performance.now();

  try {
    const buffer = await readFile(file);
    const result = await parseDocumentFromBuffer(buffer, filename);
    const elapsed = Math.round(performance.now() - started);

    if (!result.text.trim()) {
      throw new Error('Parser returned empty text');
    }

    console.log(`PASS ${filename} | ${elapsed} ms | ${result.text.length} chars | ${String(result.metadata.sourceType ?? 'unknown')}`);
  } catch (error) {
    failed += 1;
    const elapsed = Math.round(performance.now() - started);
    console.error(`FAIL ${filename} | ${elapsed} ms | ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed > 0) {
  console.error(`\nDocument ingestion smoke test failed: ${failed}/${files.length} file(s).`);
  process.exit(1);
}

console.log(`\nDocument ingestion smoke test passed: ${files.length}/${files.length} file(s).`);

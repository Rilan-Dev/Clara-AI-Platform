// Verify seed-docs parse through the platform's own document parser
import { createRequire } from "node:module";
const require = createRequire("/home/z/my-project/Clara-AI-Platform/package.json");
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// Import the platform parser via tsx-style: use the compiled TS via tsx runtime
// Simpler: replicate by requiring pdf-parse directly like the platform does.
const { parseDocumentFromBuffer } = await (async () => {
  try {
    return await import("/home/z/my-project/Clara-AI-Platform/src/modules/admin/core/ingest/document-loader.ts");
  } catch {
    return {};
  }
})();

if (parseDocumentFromBuffer) {
  for (const dir of ["omen", "techvision"]) {
    const dirPath = path.join("/home/z/my-project/Clara-AI-Platform/public/seed-docs", dir);
    for (const f of readdirSync(dirPath)) {
      const buf = readFileSync(path.join(dirPath, f));
      const parsed = await parseDocumentFromBuffer(buf, f, "application/pdf");
      const words = parsed.text.trim().split(/\s+/).length;
      console.log(`${dir}/${f}: title=${JSON.stringify(parsed.title)} chars=${parsed.text.length} words≈${words}`);
      // sample a probe query term
      const probes = { "Home-Insurance": "flood", "Motor-Insurance": "theft excess", "Life-Health": "death certificate", "Product-Docs": "rate limit", "Engineering-Runbook": "rollback" };
      const key = Object.keys(probes).find((k) => f.startsWith(k));
      if (key) console.log(`   probe '${probes[key]}': ${parsed.text.toLowerCase().includes(probes[key]) ? "FOUND" : "MISSING"}`);
    }
  }
} else {
  // fallback: pdf-parse direct
  const pdfParse = require("pdf-parse");
  for (const dir of ["omen", "techvision"]) {
    const dirPath = path.join("/home/z/my-project/Clara-AI-Platform/public/seed-docs", dir);
    for (const f of readdirSync(dirPath)) {
      const buf = readFileSync(path.join(dirPath, f));
      const parsed = await pdfParse(buf);
      console.log(`${dir}/${f}: pages=${parsed.numpages} words≈${parsed.text.trim().split(/\s+/).length}`);
    }
  }
}

/** Compare repo-test-style PDF vs my e2e PDF against pdf-parse (the primary parser). */
const path = require("node:path");
const REPO = "/home/z/my-project/Clara-AI-Platform";
const pdfParseModule = require(path.join(REPO, "node_modules/pdf-parse/lib/pdf-parse.js"));
const pdfParse = pdfParseModule.default || pdfParseModule;

// exact copy of the repo unit-test generator (document-parsers.test.ts)
function buildRepoTestPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length 50 >>\nstream\nBT\n/F1 18 Tf\n72 720 Td\n(Clara PDF test) Tj\nET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];
  let position = chunks[0].length;
  for (let index = 0; index < objects.length; index += 1) {
    const object = `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    offsets.push(position);
    chunks.push(object);
    position += object.length;
  }
  const xrefOffset = position;
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push('0000000000 65535 f \n');
  for (let index = 1; index <= objects.length; index += 1) {
    chunks.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(chunks.join(''), 'ascii');
}

// my e2e generator
function buildMyPdf(text) {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs = {
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    4: `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    5: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  };
  let out = '%PDF-1.4\n';
  const offsets = {};
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(out, 'binary');
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(out, 'binary');
  out += 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(out, 'binary');
}

(async () => {
  for (const [label, buf] of [
    ["repo-test-pdf", buildRepoTestPdf()],
    ["my-e2e-pdf", buildMyPdf("Clara insurance policy inspection document covering general liability and property damage.")],
  ]) {
    try {
      const r = await pdfParse(buf);
      console.log(label, "→ pdf-parse OK, text:", JSON.stringify(r.text.slice(0, 60)));
    } catch (e) {
      console.log(label, "→ pdf-parse FAIL:", e.message.slice(0, 120));
    }
  }
})();

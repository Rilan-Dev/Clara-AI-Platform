/** Direct experiment: which document formats parse in the standalone server? */
const BASE = "http://127.0.0.1:3000";

function buildRepoStylePdf(text) {
  const stream = `BT\n/F1 18 Tf\n72 720 Td\n(${text}) Tj\nET\n`;
  const objs = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    4: `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    5: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  };
  let out = "%PDF-1.4\n";
  const offsets = {};
  for (let i = 1; i <= 5; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefPos = out.length;
  out += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(out, "ascii");
}

(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@clara.ai", password: "Demo1234!" }),
  });
  const token = (await login.json()).token;
  const H = { Authorization: `Bearer ${token}` };

  const agent = await fetch(`${BASE}/api/orgs/10000000-0000-0000-0000-000000000001/agents`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `parse-exp-${Date.now()}` }),
  });
  const agentId = (await agent.json()).id;

  const cases = [
    ["txt", "parse-test.txt", "text/plain",
      Buffer.from("Clara parse experiment. General liability coverage for small businesses. " .repeat(3))],
    ["pdf-short", "parse-test-short.pdf", "application/pdf", buildRepoStylePdf("Clara PDF test")],
    ["pdf-long", "parse-test-long.pdf", "application/pdf",
      buildRepoStylePdf("Clara insurance policy test document. This policy covers general liability and property damage for small businesses.")],
  ];

  for (const [label, filename, type, bytes] of cases) {
    const kb = await fetch(`${BASE}/api/agents/${agentId}/kbs`, {
      method: "POST", headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Exp ${label} ${Date.now()}` }),
    });
    const kbId = (await kb.json()).id;
    const fd = new FormData();
    fd.append("files", new File([bytes], filename, { type }));
    const up = await fetch(`${BASE}/api/kbs/${kbId}/documents`, { method: "POST", headers: H, body: fd });
    const upj = await up.json();
    const docId = upj.queued?.[0]?.id;
    console.log(`\n[${label}] upload ${up.status} doc=${docId ? docId.slice(0, 8) : "?"}`);

    let last;
    const t0 = Date.now();
    while (Date.now() - t0 < 100000) {
      const d = await fetch(`${BASE}/api/kbs/${kbId}/documents/${docId}`, { headers: H });
      const dj = await d.json();
      if (dj.status !== last) {
        console.log(`  t+${Math.round((Date.now() - t0) / 1000)}s status: ${dj.status}` +
          (dj.errorMessage ? ` | err: ${String(dj.errorMessage).slice(0, 160)}` : "") +
          (dj.chunkCount != null ? ` | chunks: ${dj.chunkCount}` : ""));
        last = dj.status;
      }
      if (dj.status === "ready" || dj.status === "failed") break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    // cleanup KB (doc cascades)
    await fetch(`${BASE}/api/kbs/${kbId}`, { method: "DELETE", headers: H });
  }
  await fetch(`${BASE}/api/agents/${agentId}`, { method: "DELETE", headers: H });
  console.log("\n(cleanup done)");
})();

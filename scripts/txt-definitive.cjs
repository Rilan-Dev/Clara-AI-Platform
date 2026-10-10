/** Definitive TXT ingest experiment: upload → watch → inspect DB + Qdrant. No cleanup. */
const fs = require("node:fs");
const path = require("node:path");
const REPO = "/home/z/my-project/Clara-AI-Platform";
const pg = require(path.join(REPO, "node_modules", "pg"));
const BASE = "http://127.0.0.1:3000";

(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@clara.ai", password: "Demo1234!" }),
  });
  const token = (await login.json()).token;
  const H = { Authorization: `Bearer ${token}` };

  const agent = await fetch(`${BASE}/api/orgs/10000000-0000-0000-0000-000000000001/agents`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `txt-definitive-${Date.now()}` }),
  });
  const agentId = (await agent.json()).id;
  const kb = await fetch(`${BASE}/api/agents/${agentId}/kbs`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `Txt Definitive ${Date.now()}` }),
  });
  const kbId = (await kb.json()).id;
  console.log("kbId:", kbId);

  const fd = new FormData();
  fd.append("files", new File([
    Buffer.from("Clara definitive TXT experiment. Liability coverage text. ".repeat(4)),
  ], "definitive.txt", { type: "text/plain" }));
  const up = await fetch(`${BASE}/api/kbs/${kbId}/documents`, { method: "POST", headers: H, body: fd });
  const upj = await up.json();
  const docId = upj.queued?.[0]?.id;
  console.log("upload:", up.status, "docId:", docId);

  let last;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const d = await fetch(`${BASE}/api/kbs/${kbId}/documents/${docId}`, { headers: H });
    const dj = await d.json();
    if (dj.status !== last) {
      console.log(`t+${Math.round((Date.now() - t0) / 1000)}s status=${dj.status} chunks=${dj.chunkCount} job=${JSON.stringify(dj.job?.status ?? null)}`);
      last = dj.status;
    }
    if (dj.status === "ready" || dj.status === "failed") break;
    await new Promise((r) => setTimeout(r, 1500));
  }

  // inspect DB directly
  const env = fs.readFileSync(path.join(REPO, ".env"), "utf8");
  const c = new pg.Client({ connectionString: env.match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, "") });
  await c.connect();
  const doc = await c.query("select id, status, chunk_count, error_message from documents where id = $1", [docId]);
  console.log("\nDB doc row:", JSON.stringify(doc.rows[0]));
  const jobs = await c.query("select id, status, attempts, error_message, started_at, completed_at from ingest_jobs where document_id = $1", [docId]);
  console.log("DB job rows:", JSON.stringify(jobs.rows, null, 1));
  const kbRow = await c.query("select id, name, qdrant_collection from knowledge_bases where id = $1", [kbId]);
  const collection = kbRow.rows[0]?.qdrant_collection;
  console.log("collection:", collection);

  // Qdrant point count
  const qurl = env.match(/^QDRANT_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, "");
  const qkey = (env.match(/^QDRANT_API_KEY=(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "");
  const qh = qkey ? { "api-key": qkey } : {};
  const qr = await fetch(`${qurl}/collections/${collection}`, { headers: qh });
  const qj = await qr.json();
  console.log("Qdrant collection:", qr.status, "points:", qj.result?.points_count, "status:", qj.result?.status);

  // chunks rows
  const chunks = await c.query("select count(*)::int as n from document_chunks where document_id = $1", [docId]);
  console.log("document_chunks rows:", chunks.rows[0].n);

  await c.end();
  console.log("\nNO CLEANUP — kbId:", kbId, "agentId:", agentId, "docId:", docId);
})();

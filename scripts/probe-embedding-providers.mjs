// Probe embedding provider connectivity from sandbox (OpenAI + Gemini)
import { createRequire } from "node:module";
const require = createRequire("/home/z/my-project/Clara-AI-Platform/package.json");
import { readFileSync } from "node:fs";
const env = readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const get = (k) => env.match(new RegExp(`^${k}=\"?([^\"]*)\"?$`, "m"))?.[1]?.trim();

const openaiKey = get("OPENAI_API_KEY");
const geminiKey = get("GEMINI_API_KEY");

// OpenAI embeddings
try {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: "connectivity probe" }),
  });
  const body = await res.text();
  console.log(`OPENAI embeddings: HTTP ${res.status} → ${body.slice(0, 120)}`);
} catch (e) { console.log("OPENAI embeddings: FETCH FAILED", e.message); }

// Gemini embeddings
try {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "models/text-embedding-004", content: { parts: [{ text: "connectivity probe" }] } }),
  });
  const body = await res.text();
  console.log(`GEMINI embeddings: HTTP ${res.status} → ${body.slice(0, 120)}`);
} catch (e) { console.log("GEMINI embeddings: FETCH FAILED", e.message); }

// Qdrant
const qurl = get("QDRANT_URL");
try {
  const res = await fetch(`${qurl}/collections`);
  console.log(`QDRANT: HTTP ${res.status} → ${(await res.text()).slice(0, 150)}`);
} catch (e) { console.log("QDRANT: FETCH FAILED", e.message); }

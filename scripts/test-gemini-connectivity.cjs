/** Test Gemini API connectivity + current model availability from this sandbox. */
const fs = require("node:fs");

const env = fs.readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const key = env.match(/^GEMINI_API_KEY=(.+)$/m)[1].trim().replace(/^["']|["']$/g, "");
const BASE = "https://generativelanguage.googleapis.com/v1beta";

(async () => {
  for (const model of ["gemini-2.5-flash", "gemini-flash-latest"]) {
    try {
      const r = await fetch(`${BASE}/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with exactly: OK" }] }] }),
      });
      const j = await r.json();
      console.log(model, "generate:", r.status, JSON.stringify(
        j.candidates?.[0]?.content?.parts?.[0]?.text ?? j.error?.message
      ).slice(0, 60));
    } catch (e) {
      console.log(model, "NETWORK FAIL", e.message.slice(0, 60));
    }
  }
  try {
    const r2 = await fetch(`${BASE}/models/gemini-embedding-001:embedContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "models/gemini-embedding-001", content: { parts: [{ text: "ping" }] } }),
    });
    if (r2.status === 200) {
      console.log("gemini-embedding-001:", r2.status, "dim:", (await r2.json()).embedding.values.length);
    } else {
      console.log("gemini-embedding-001:", r2.status, JSON.stringify((await r2.json()).error?.message).slice(0, 60));
    }
  } catch (e) {
    console.log("embed NETWORK FAIL", e.message.slice(0, 60));
  }
})();

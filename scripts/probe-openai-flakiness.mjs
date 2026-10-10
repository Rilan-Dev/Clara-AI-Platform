import { readFileSync } from "node:fs";
const env = readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const get = (k) => env.match(new RegExp(`^${k}="?([^"\\n]*)"?$`, "m"))?.[1]?.trim();

const openaiKey = get("OPENAI_API_KEY");
const demoKey = get("DEMO_OPENAI_API_KEY");
console.log("main key len:", openaiKey?.length, "| demo key len:", demoKey?.length);

async function tryEmbed(label, key, model) {
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: "probe" }),
      signal: AbortSignal.timeout(15000),
    });
    return `${label}: HTTP ${res.status}`;
  } catch (e) { return `${label}: ERR ${e.message}`; }
}

// 8 attempts interleaved to sample different Cloudflare POPs
for (let i = 0; i < 8; i++) {
  const a = await tryEmbed(`main#${i}`, openaiKey, "text-embedding-3-small");
  const b = demoKey ? await tryEmbed(`demo#${i}`, demoKey, "text-embedding-3-small") : "demo: none";
  console.log(a, "|", b);
  await new Promise((r) => setTimeout(r, 500));
}

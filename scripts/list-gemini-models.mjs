import { readFileSync } from "node:fs";
const env = readFileSync("/home/z/my-project/Clara-AI-Platform/.env", "utf8");
const geminiKey = env.match(/^GEMINI_API_KEY="?([^"\n]*)"?$/m)?.[1]?.trim();
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}&pageSize=100`);
const body = await res.json();
console.log("HTTP", res.status);
for (const m of body.models ?? []) {
  if (/embed/i.test(m.name) || /embed/i.test((m.supportedGenerationMethods ?? []).join(","))) {
    console.log(m.name, "|", (m.supportedGenerationMethods ?? []).join(","));
  }
}

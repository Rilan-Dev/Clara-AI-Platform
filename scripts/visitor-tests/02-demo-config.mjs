import { authHeaders, expectHttp, assert } from "./_lib.mjs";

console.log("\n[02] DEMO CONFIG / FIXED KB / OPENAI\n");
const r = await expectHttp("demo config", "/api/embed/config", [200], { headers: authHeaders() });
const c = r.json;
assert(c && c.kbId, "Demo config must expose a KB id");
assert(c.kbName, "Demo config must expose a KB name");
assert(c.voiceEnabled === true, "Demo voice must be enabled");
assert(String(c.voiceProvider || "").toLowerCase() === "openai", `Demo voice provider must be OpenAI, got ${c.voiceProvider}`);
console.log(`PASS | demo KB is fixed server-side | kbId=${c.kbId} | kbName=${c.kbName}`);
console.log("PASS | visitor does not need to select provider/model/voice");

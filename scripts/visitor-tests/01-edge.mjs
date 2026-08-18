import { authHeaders, expectHttp, assert } from "./_lib.mjs";

console.log("\n[01] PUBLIC EDGE / CORS / STATIC EMBED\n");
await expectHttp("embed script", "/embed/clara.js", [200], { headers: { Origin: process.env.CLARA_ORIGIN || "https://clara.ai.amazetechclans.com" } });
await expectHttp("embed config preflight", "/api/embed/config", [204], { method: "OPTIONS", headers: { ...authHeaders(), "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization,content-type" } });
const unauth = await expectHttp("unauthenticated embed config rejected", "/api/embed/config", [401]);
assert(unauth.status === 401, "Missing auth must not be accepted");
console.log("PASS | public edge security baseline");

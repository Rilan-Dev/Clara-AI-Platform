import { authHeaders, expectHttp, assert } from "./_lib.mjs";

console.log("\n[06] VOICE CONNECT CONTRACT / INPUT VALIDATION\n");
const r = await expectHttp("voice-connect rejects empty SDP", "/api/embed/voice-connect", [400], {
  method: "POST",
  headers: authHeaders(),
  body: JSON.stringify({}),
});
assert(r.json?.error?.includes("sdpOffer"), "voice-connect must explain that sdpOffer is required");
console.log("PASS | voice-connect request contract");
console.log("NOTE | A real WebRTC media-path test is intentionally separate: it requires a browser RTCPeerConnection and microphone permission. The deployed widget test is documented in scripts/visitor-tests/README.md.");

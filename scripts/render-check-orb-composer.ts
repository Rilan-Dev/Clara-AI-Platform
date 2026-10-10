/**
 * Structural render check for OrbComposer — renders the component to static
 * markup (no browser needed) to confirm it mounts without runtime exceptions
 * and emits the expected affordances: orb, divider, textarea, mic, send.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { OrbComposer } from "../.worktrees/vc/src/features/agent-conversation/components/orb-composer";

const html = renderToStaticMarkup(
  createElement(OrbComposer, {
    input: "",
    onInputChange: () => {},
    onSend: () => {},
    canSend: false,
    placeholder: "Ask Clara anything…",
    assistantName: "Clara",
    voiceAvailable: true,
    voiceUnavailableReason: null,
    onVoiceStart: () => {},
    primaryColour: "#6366f1",
    accentColour: "#8b5cf6",
    thinking: false,
  }),
);

// Second render: enabled send state must carry the brand gradient.
const htmlEnabled = renderToStaticMarkup(
  createElement(OrbComposer, {
    input: "hello",
    onInputChange: () => {},
    onSend: () => {},
    canSend: true,
    placeholder: "Ask Clara anything…",
    assistantName: "Clara",
    voiceAvailable: true,
    voiceUnavailableReason: null,
    onVoiceStart: () => {},
    primaryColour: "#6366f1",
    accentColour: "#8b5cf6",
    thinking: true,
  }),
);

const checks: Array<[string, boolean]> = [
  ["textarea present", /<textarea/.test(html)],
  ["orb-input testid", /data-testid="orb-input"/.test(html)],
  ["aria label for messaging", /aria-label="Message Clara"/.test(html)],
  ["voice mic button", /aria-label="Start realtime voice"/.test(html)],
  ["send button", /aria-label="Send message"/.test(html)],
  ["divider", /w-px/.test(html)],
  ["owner-directed orb gif", /cdn\.21st\.dev\/assets\/mirror\/1e\/1ea795ce563e99649f180625b9008f169bcf63bb1eaecce2c2e01ac1b8b5a09e\.gif/.test(html)],
  ["orb image alt text", /alt="Animated orb"/.test(html)],
  ["pill shape", /rounded-full/.test(html)],
  ["disabled send uses muted background", /background:var\(--muted-foreground\)/.test(html)],
  ["brand gradient on enabled send", /linear-gradient\(135deg, #6366f1, #8b5cf6\)/.test(htmlEnabled)],
  ["thinking ripple visible when thinking", /clara-orb-ripple/.test(htmlEnabled)],
  ["no colored focus border classes", !/border-primary\/45/.test(html)],
  ["focus ring suppressed on textarea", /focus:shadow-none focus-visible:shadow-none/.test(html)],
  ["neutral pill border on initial state", /rounded-full border-border\/70/.test(html)],
  ["thinking ripple hidden when idle", !/clara-orb-ripple/.test(html)],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(`\n${failed} structural check(s) failed. HTML:\n${html.slice(0, 2000)}`);
  process.exit(1);
}
console.log("\nAll structural checks passed.");

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const orbComposerSource = readFileSync(
  resolve(__dirname, "orb-composer.tsx"),
  "utf8",
);

const chatWindowSource = readFileSync(
  resolve(__dirname, "conversation-chat-window.tsx"),
  "utf8",
);

describe("OrbComposer (chat-mode orb input)", () => {
  it("is fully self-contained — no third-party CDN or remote image asset", () => {
    // The reference mock loaded an animated GIF from cdn.21st.dev; the
    // production orb must be pure CSS so a slow/unreachable external CDN
    // can never break the chat input on any published agent page.
    expect(orbComposerSource).not.toMatch(/https?:\/\/[^"']+\.(gif|png|jpg|webp|svg)/i);
    expect(orbComposerSource).not.toContain("21st.dev");
    expect(orbComposerSource).not.toContain("<img");
  });

  it("keeps the voice start affordance wired to the shared onVoiceStart contract", () => {
    // The mic button must start the exact same realtime session as the
    // voice lobby — the single onVoiceStart callback, nothing provider-specific.
    expect(orbComposerSource).toContain("onVoiceStart?: () => void");
    expect(orbComposerSource).toMatch(/onClick=\{onVoiceStart\}/);
    expect(orbComposerSource).toContain('aria-label="Start realtime voice"');
  });

  it("keeps the typewriter interaction model from the supplied example", () => {
    expect(orbComposerSource).toContain("const CHAR_DELAY = 75");
    expect(orbComposerSource).toContain("const IDLE_DELAY_AFTER_FINISH = 2200");
    expect(orbComposerSource).toContain('data-testid="orb-input"');
  });

  it("respects prefers-reduced-motion for the cycling placeholder", () => {
    expect(orbComposerSource).toContain("(prefers-reduced-motion: reduce)");
  });

  it("is provider-neutral — never imports providers, chat streams or APIs", () => {
    expect(orbComposerSource).not.toMatch(/from\s+"(@\/modules\/(ai-core|voice-core)|\.\.\/lib\/chat-stream|\.\.\/hooks\/use-agent-conversation)/);
    expect(orbComposerSource).not.toMatch(/fetch\(|EventSource|WebSocket/);
  });

  it("is wired into the chat branch of ConversationChatWindow", () => {
    expect(chatWindowSource).toMatch(
      /import \{ OrbComposer \} from "\.\/orb-composer"/,
    );
    expect(chatWindowSource).toContain("<OrbComposer");
    // The previous send gating (canSend) is preserved at the wiring site.
    expect(chatWindowSource).toMatch(/<OrbComposer[\s\S]*?canSend=\{canSend\}/);
  });

  it("keeps textarea semantics — Enter sends, Shift+Enter inserts a newline", () => {
    expect(orbComposerSource).toContain("e.key === \"Enter\" && !e.shiftKey");
    expect(orbComposerSource).toMatch(/<textarea/);
  });
});

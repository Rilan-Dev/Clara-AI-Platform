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
  it("uses the owner-directed animated orb asset from the reference example", () => {
    // Owner explicitly directed the exact 21st.dev mirror GIF from the
    // supplied OrbInput example to be the left-side orb of the composer.
    expect(orbComposerSource).toContain(
      "https://cdn.21st.dev/assets/mirror/1e/1ea795ce563e99649f180625b9008f169bcf63bb1eaecce2c2e01ac1b8b5a09e.gif",
    );
    expect(orbComposerSource).toContain('alt="Animated orb"');
    expect(orbComposerSource).toMatch(/rounded-full[^"']*transition-all/);
  });

  it("shows no colored focus border on the pill or the textarea", () => {
    // The global `*:focus-visible` rule paints a box-shadow ring in
    // hsl(var(--ring)) (indigo) on the radius-less textarea — a square purple
    // border while the input is active. The composer must suppress it, and
    // the pill must keep its neutral border in every state.
    expect(orbComposerSource).not.toContain("border-primary/45");
    expect(orbComposerSource).not.toContain("focus-within:border-primary");
    expect(orbComposerSource).toMatch(/focus:shadow-none focus-visible:shadow-none/);
    expect(orbComposerSource).toMatch(/isFocused[\s\S]{0,200}border-border\/70/);
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

import { describe, expect, it } from "vitest";
import { buildTurnGuidance } from "./turn-guidance";

const FALLBACK = "I can only answer questions about the topics I have been set up for.";

describe("buildTurnGuidance — provider-neutral, no canned refusal", () => {
  it("no evidence: handles greetings/small talk naturally and redirects to the KB topics", () => {
    const text = buildTurnGuidance({
      grounded: false,
      intent: "out_of_scope",
      responseLanguage: "ta",
      fallbackReply: FALLBACK,
      topics: "Home insurance, Personal accident insurance, Health insurance",
    });
    expect(text).toContain("Reply in Tamil");
    expect(text).toMatch(/greeting, thanks, small talk/i);
    expect(text).toContain("Topics you can help with: Home insurance, Personal accident insurance, Health insurance");
    // The operator's fallback is used for its meaning, never recited.
    expect(text).toContain("do not recite it word for word");
    expect(text).toMatch(/Never open with or repeat a restriction/);
    expect(text).not.toMatch(/say exactly/i);
  });

  it("capability: overview of the tenant's topics, no refusal", () => {
    const text = buildTurnGuidance({ grounded: false, intent: "capability", topics: "Billing, Accounts" });
    expect(text).toMatch(/what you can help with/);
    expect(text).toContain("Topics you can help with: Billing, Accounts");
    expect(text).not.toMatch(/No knowledge-base passage matched/);
  });

  it("grounded: answer from the passages without adding facts", () => {
    const text = buildTurnGuidance({ grounded: true, intent: "knowledge" });
    expect(text).toMatch(/Answer from the knowledge-base passages/);
    expect(text).not.toMatch(/No knowledge-base passage matched/);
  });

  it("grounded written answers must preserve every listed requirement without inventing any", () => {
    const text = buildTurnGuidance({ grounded: true, intent: "knowledge", channel: "chat" });
    expect(text).toContain("every applicable numbered or bulleted requirement");
    expect(text).toContain("list may be incomplete");
    expect(text).toContain("Never invent additional requirements");
  });

  it("spoken answers preserve every evidenced requirement for explicit complete-list requests", () => {
    const text = buildTurnGuidance({ grounded: true, intent: "knowledge", channel: "voice" });
    expect(text).toContain("every applicable numbered or bulleted requirement");
    expect(text).toContain("never present examples or a partial top-K retrieval as the full set");
    expect(text).toContain("enumerate all items supported by the retrieved evidence");
    expect(text).toContain("only a partial answer");
    expect(text).toContain("never silently imply the list is complete");
  });

  it("voice: spoken replies always end on complete sentences", () => {
    expect(buildTurnGuidance({ grounded: true, intent: "knowledge", channel: "voice" })).toMatch(/finish your sentences/);
    expect(buildTurnGuidance({ grounded: true, intent: "knowledge", channel: "chat" })).not.toMatch(/finish your sentences/);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GREETING_QUESTION_PLACEHOLDER,
  isGreetingTurn,
} from "./voice-turns";

const hookSource = readFileSync(
  resolve(__dirname, "../hooks/use-agent-conversation.ts"),
  "utf8",
);

const stageSource = readFileSync(
  resolve(__dirname, "../components/conversation-voice-stage.tsx"),
  "utf8",
);

const chatWindowSource = readFileSync(
  resolve(__dirname, "../components/conversation-chat-window.tsx"),
  "utf8",
);

describe("isGreetingTurn (voice turn classifier)", () => {
  it("classifies the OpenAI/Gemini placeholder convention as a greeting", () => {
    // useOpenAIRealtime + useGeminiLive seed the greeting turn with the
    // literal placeholder text — this is what printed "You: Welcome message".
    expect(isGreetingTurn({ question: "Welcome message", answer: "" })).toBe(true);
    expect(isGreetingTurn({ question: " Welcome message ", answer: "partial" })).toBe(true);
    expect(GREETING_QUESTION_PLACEHOLDER).toBe("Welcome message");
  });

  it("classifies the ElevenLabs/Sarvam empty-question convention as a greeting", () => {
    expect(isGreetingTurn({ question: "", answer: "Hey there…" })).toBe(true);
    expect(isGreetingTurn({ question: null, answer: "Hey there…" })).toBe(true);
    expect(isGreetingTurn({})).toBe(true);
  });

  it("classifies real conversational turns (incl. partial STT) as non-greetings", () => {
    expect(isGreetingTurn({ question: "What are your prices?", answer: "" })).toBe(false);
    expect(isGreetingTurn({ question: "hello", answer: "Hi!" })).toBe(false);
  });
});

describe("use-agent-conversation fold logic", () => {
  it("imports the greeting classifier and skips greeting turns in the live fold", () => {
    expect(hookSource).toMatch(
      /import \{ isGreetingTurn \} from "\.\.\/lib\/voice-turns";/,
    );
    // The live-fold effect must skip greeting turns BEFORE folding anything.
    expect(hookSource).toMatch(
      /if \(isGreetingTurn\(turn\)\) continue;[\s\S]{0,220}const question = \(turn\.question \?\? ""\)\.trim\(\);\s*const answer = turn\.answer \?\? "";/,
    );
  });

  it("skips greeting turns when folding on session end (endVoice)", () => {
    // endVoice folds with trimmed question/answer — the second fold site.
    const foldSites = hookSource.match(/if \(isGreetingTurn\(turn\)\) continue;/g) ?? [];
    expect(foldSites.length).toBe(2);
    expect(hookSource).toMatch(
      /const turns = voiceHistoryRef\.current \?\? \[\];[\s\S]{0,260}if \(isGreetingTurn\(turn\)\) continue;/,
    );
  });
});

describe("ConversationVoiceStage transcript", () => {
  it("selects the last turn the user actually spoke, never the greeting", () => {
    expect(stageSource).toMatch(/import \{ isGreetingTurn \} from "\.\.\/lib\/voice-turns";/);
    // Reverse scan over history with the greeting filter.
    expect(stageSource).toMatch(
      /for \(let i = history\.length - 1; i >= 0; i--\) \{\s*if \(!isGreetingTurn\(history\[i\]\)\) return history\[i\];/,
    );
    expect(stageSource).not.toMatch(
      /session\.history\[session\.history\.length - 1\]/,
    );
  });
});

describe("ConversationChatWindow welcome gating", () => {
  it("renders the welcome message only before the first message exists", () => {
    // Both render sites (chat branch + ConversationRail) must gate on an
    // empty message list — the welcome is an empty-state, not a permanent
    // fixture pinned at the top of the transcript.
    const gatedSites = chatWindowSource.match(
      /\{messages\.length === 0 && \(\s*<WelcomeMessage/g,
    ) ?? [];
    const totalSites = chatWindowSource.match(/<WelcomeMessage/g) ?? [];
    expect(gatedSites.length).toBe(2);
    expect(totalSites.length).toBe(2);
  });
});

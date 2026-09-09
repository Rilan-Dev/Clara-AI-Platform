// /**
//  * GET /api/platform/demo-config
//  * ─────────────────────────────────────────────────────────────────────────────
//  * Public (unauthenticated) endpoint that returns all demo configuration
//  * needed by the landing page components (DemoAssistantFAB, DemoVoiceSection).
//  *
//  * All values are read from the `platform_env_settings` table (category=demo)
//  * and managed exclusively via the Platform Admin Panel → Demo page.
//  */
// import { NextResponse } from "next/server";
// import { getPlatformEnvSettings } from "@/modules/phone/core/db";
// import { ensureMigrated } from "@/lib/db/migrate";

// /** Helper — get a demo setting or fall back to a default. */
// function demoval(
//   settings: Array<{ key: string; value: string }>,
//   key: string,
//   fallback: string,
// ): string {
//   const found = settings.find((s) => s.key === key);
//   return found?.value || fallback;
// }

// export async function GET() {
//   try {
//     await ensureMigrated();
//     const settings = await getPlatformEnvSettings();

//     // Filter to demo keys only
//     const demo = settings.filter((s) => s.key.startsWith("DEMO_"));

//     const enabled      = demoval(demo, "DEMO_ENABLED", "true") === "true";
//     const voiceEnabled = demoval(demo, "DEMO_VOICE_ENABLED", "true") === "true";
//     const chatEnabled  = demoval(demo, "DEMO_CHAT_ENABLED", "true") === "true";

//     // Parse suggested prompts (stored as JSON string)
//     let suggestedPrompts: string[] = [];
//     try {
//       const raw = demoval(demo, "DEMO_SUGGESTED_PROMPTS", "[]");
//       suggestedPrompts = JSON.parse(raw);
//     } catch {
//       suggestedPrompts = [
//         "What does my insurance cover?",
//         "How do I file a claim?",
//         "Tell me about voice AI features",
//         "How does RAG-powered search work?",
//       ];
//     }

//     return NextResponse.json({
//       enabled,
//       voiceEnabled,
//       chatEnabled,
//       kbId:              demoval(demo, "DEMO_KB_ID", "30000000-0000-0000-0000-000000000001"),
//       kbName:            demoval(demo, "DEMO_KB_NAME", "Demo Insurance Knowledge Base"),
//       voiceGreeting:     demoval(demo, "DEMO_VOICE_GREETING", "Hi! I am Clara, an AI assistant. How can I help you today?"),
//       suggestedPrompts,
//       rateLimitPerHour:  parseInt(demoval(demo, "DEMO_RATE_LIMIT_PER_HOUR", "100"), 10),
//       maxRequestsPerDay: parseInt(demoval(demo, "DEMO_MAX_REQUESTS_PER_DAY", "1000"), 10),
//     });
//   } catch (error) {
//     console.error("[demo-config] Failed to fetch demo config:", error);
//     // Return safe defaults so the landing page doesn't break
//     return NextResponse.json({
//       enabled: true,
//       voiceEnabled: true,
//       chatEnabled: true,
//       kbId: "30000000-0000-0000-0000-000000000001",
//       kbName: "Demo Insurance Knowledge Base",
//       voiceGreeting: "Hi! I am Clara, an AI assistant. How can I help you today?",
//       suggestedPrompts: [
//         "What does my insurance cover?",
//         "How do I file a claim?",
//         "Tell me about voice AI features",
//         "How does RAG-powered search work?",
//       ],
//       rateLimitPerHour: 100,
//       maxRequestsPerDay: 1000,
//     });
//   }
// }

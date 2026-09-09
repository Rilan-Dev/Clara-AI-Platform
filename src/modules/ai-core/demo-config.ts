// import { getPlatformEnvSettings } from "@/modules/phone/core/db";
// import type { AIProvider } from "./config-types";

// export type DemoAIConfig = {
//   provider: AIProvider;
//   apiKey: string;
//   chatModel: string;
//   embeddingModel: string;
//   embeddingDimension: number;
//   realtimeModel: string;
//   transcriptionModel: string | null;
//   voiceId: string | null;
// };

// type PlatformSetting = Awaited<ReturnType<typeof getPlatformEnvSettings>>[number];

// function value(settings: PlatformSetting[], key: string, fallback = ""): string {
//   return settings.find((setting) => setting.key === key)?.value?.trim() ||
//     process.env[key]?.trim() ||
//     fallback;
// }

// /**
//  * Resolve the provider configuration owned by Platform Admin -> Demo.
//  * Demo traffic must not depend on a tenant/project AI assignment because the
//  * landing page is intentionally usable without an authenticated tenant.
//  */
// export async function getDemoAIConfig(): Promise<DemoAIConfig | null> {
//   const settings = await getPlatformEnvSettings();
//   return getDemoAIConfigFromSettings(settings);
// }

// export function getDemoAIConfigFromSettings(settings: PlatformSetting[]): DemoAIConfig | null {
//   const provider = (value(settings, "DEMO_AI_PROVIDER", "openai").toLowerCase() === "gemini"
//     ? "gemini"
//     : "openai") as AIProvider;

//   if (provider === "gemini") {
//     const apiKey = value(settings, "DEMO_GEMINI_API_KEY");
//     if (!apiKey) return null;

//     const embeddingModel = value(settings, "DEMO_GEMINI_EMBEDDING_MODEL", "gemini-embedding-001");
//     return {
//       provider,
//       apiKey,
//       chatModel: value(settings, "DEMO_GEMINI_CHAT_MODEL", "gemini-3.6-flash"),
//       embeddingModel,
//       embeddingDimension: 3072,
//       realtimeModel: value(settings, "DEMO_GEMINI_LIVE_MODEL"),
//       transcriptionModel: null,
//       voiceId: value(settings, "DEMO_GEMINI_LIVE_VOICE", "Aoede"),
//     };
//   }

//   const apiKey = value(settings, "DEMO_OPENAI_API_KEY");
//   if (!apiKey) return null;

//   const embeddingModel = value(settings, "DEMO_OPENAI_EMBEDDING_MODEL", "text-embedding-3-small");
//   return {
//     provider,
//     apiKey,
//     chatModel: value(settings, "DEMO_OPENAI_CHAT_MODEL", "gpt-5.4-mini"),
//     embeddingModel,
//     embeddingDimension: embeddingModel === "text-embedding-3-large" ? 3072 : 1536,
//     realtimeModel: value(settings, "DEMO_OPENAI_REALTIME_MODEL", "gpt-realtime-mini"),
//     transcriptionModel: value(settings, "DEMO_OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe") || null,
//     voiceId: value(settings, "DEMO_OPENAI_VOICE", "alloy") || null,
//   };
// }

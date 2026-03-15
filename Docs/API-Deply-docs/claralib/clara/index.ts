/**
 * src/lib/clara/index.ts
 * Import from here. Two hooks, that's all.
 *
 *   import { useClara }      from "@/lib/clara";
 *   import { useClaraVoice } from "@/lib/clara";
 */
export { useClara }      from "./useClara";
export { useClaraVoice } from "./useClaraVoice";
export type { Message, ClaraConfig }                         from "./useClara";
export type { VoiceStatus, VoiceTurn, UseClaraVoiceReturn }  from "./useClaraVoice";
export { CLARA_CONFIG }  from "./config";

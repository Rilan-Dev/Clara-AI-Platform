/**
 * src/components/clara/index.ts — Production Clara components
 */
export { ClaraWidget }                          from "@/components/ClaraWidget";
export { ClaraSidePanelProvider, useSidePanel } from "./ClaraSidePanel";
export { ClaraVoiceButton }                     from "./ClaraVoiceButton";
export { useClara }                             from "@/lib/clara/useClara";
export { useClaraVoice }                        from "@/lib/clara/useClaraVoice";
export type { Message, ClaraConfig }            from "@/lib/clara/useClara";
export type { VoiceStatus, VoiceTurn }          from "@/lib/clara/useClaraVoice";

import { AiPlatformWorkspace } from "@/components/admin/ai-platform/AiPlatformWorkspace";

function flagEnabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export default function AIPlatformPage() {
  return (
    <AiPlatformWorkspace
      toolCallingEnabled={flagEnabled(process.env.ENABLE_AI_PLATFORM_TOOL_CALLING)}
      agentLoopEnabled={flagEnabled(process.env.ENABLE_AI_PLATFORM_AGENT_LOOP)}
    />
  );
}

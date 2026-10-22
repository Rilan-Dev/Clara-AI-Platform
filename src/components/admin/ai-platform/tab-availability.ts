/** The visible tab must match the rendered panel when feature availability changes. */
export type AiPlatformTab =
  | "overview" | "providers" | "tools" | "integrations" | "agent-loop" | "verification";

export function effectiveAiPlatformTab(
  selected: AiPlatformTab,
  integrationsEnabled: boolean,
): AiPlatformTab {
  return selected === "integrations" && !integrationsEnabled
    ? "overview"
    : selected;
}

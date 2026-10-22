import type { AgentVersionConfig } from "./types";
import { WIDGET_DESIGN_FIELDS } from "@/modules/knowledge-bases/core/widget-config-policy";

/**
 * A versioned agent draft contains both native assistant fields and optional
 * embeddable-widget design. Editing native fields while the widget is disabled
 * must not silently change the widget state in either agent_drafts or the
 * legacy assistant_configs projection.
 */
export function changesDisabledWidgetDesign(
  current: AgentVersionConfig,
  incoming: AgentVersionConfig,
): boolean {
  const supplied = incoming.assistant as unknown as Record<string, unknown>;
  for (const field of WIDGET_DESIGN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(supplied, field) &&
        !Object.is(incoming.assistant[field], current.assistant[field])) {
      return true;
    }
  }
  return false;
}

/**
 * Internal restore/merge/default-update paths may legitimately copy an older
 * native persona. Preserve every current widget property without mutating
 * the historical version or the caller's input, so it cannot become an
 * unauthorized widget edit if the feature is later re-enabled.
 */
export function preserveDisabledWidgetDesign(
  current: AgentVersionConfig,
  incoming: AgentVersionConfig,
): AgentVersionConfig {
  const assistant = { ...incoming.assistant };
  for (const field of WIDGET_DESIGN_FIELDS) {
    (assistant as unknown as Record<string, unknown>)[field] = current.assistant[field];
  }
  return { ...incoming, assistant };
}

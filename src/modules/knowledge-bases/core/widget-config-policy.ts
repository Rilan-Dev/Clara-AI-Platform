import type {
  AssistantConfig,
  PatchAssistantConfigInput,
  PutAssistantConfigInput,
} from "./models";

/**
 * Settings owned by the optional embeddable widget/editor, including its
 * voice-button *appearance* (not the native voice capability itself).
 *
 * Keep this list in sync with the widget-design fields of AssistantConfig.
 * Shared identity/prompt/voice/language fields must remain writable.
 */
export const WIDGET_DESIGN_FIELDS = [
  "primaryColour",
  "accentColour",
  "launcherColour",
  "widgetTheme",
  "widgetPosition",
  "widgetButtonSize",
  "widgetBorderRadius",
  "widgetFontFamily",
  "widgetChatHeight",
  "widgetShowBranding",
  "widgetLauncherLabel",
  "widgetMode",
  "headerBg",
  "headerTextColor",
  "headerHeight",
  "headerBlur",
  "showStatusDot",
  "statusDotColor",
  "avatarShape",
  "chatAreaBg",
  "userBubbleBg",
  "userBubbleText",
  "userBubbleRadius",
  "userBubblePadding",
  "userBubbleShadow",
  "botBubbleBg",
  "botBubbleText",
  "botBubbleRadius",
  "botBubbleBorder",
  "botBubblePadding",
  "botBubbleShadow",
  "messageGap",
  "messageMaxWidth",
  "messageFontSize",
  "messageLineHeight",
  "showTimestamps",
  "timestampColor",
  "timestampFontSize",
  "typingDotColor",
  "typingDotSize",
  "inputBg",
  "inputBorder",
  "inputBorderFocus",
  "inputRadius",
  "inputTextColor",
  "inputPlaceholderColor",
  "inputPadding",
  "inputAreaBg",
  "inputAreaBorder",
  "sendBtnBg",
  "sendBtnHoverBg",
  "sendBtnTextColor",
  "sendBtnRadius",
  "sendBtnSize",
  "scrollbarWidth",
  "scrollbarColor",
  "scrollbarTrackColor",
  "footerBg",
  "footerTextColor",
  "animationsEnabled",
  "messageAnimationStyle",
  "customCss",
  "customLauncherSvg",
  "customHeaderHtml",
  "customFooterHtml",
  "customThemeCss",
  "customInjectJs",
  "customPoweredBy",
  "voiceBtnBg",
  "voiceBtnSize",
  "voiceBtnRadius",
  "voiceBtnActiveColor",
  "voicePanelBg",
  "voiceWaveColor",
] as const satisfies readonly (keyof PutAssistantConfigInput)[];

type WidgetField = (typeof WIDGET_DESIGN_FIELDS)[number];
type WritableWidgetFields = Record<WidgetField, unknown>;

/**
 * PUT is a full replacement. Do not let a disabled widget's defaults silently
 * overwrite its saved appearance when unrelated assistant fields are edited.
 *
 * Explicit widget changes are rejected; unchanged submitted values are allowed,
 * and every stored widget field is copied back before persistence.
 */
export function preserveDisabledWidgetFieldsOnPut(
  input: PutAssistantConfigInput,
  supplied: Record<string, unknown>,
  existing: AssistantConfig | null,
): boolean {
  const values = input as unknown as WritableWidgetFields;
  for (const field of WIDGET_DESIGN_FIELDS) {
    if (
      Object.prototype.hasOwnProperty.call(supplied, field) &&
      (!existing || !Object.is(values[field], existing[field]))
    ) {
      return false;
    }
  }
  if (existing) {
    for (const field of WIDGET_DESIGN_FIELDS) {
      values[field] = existing[field];
    }
  }
  return true;
}

/**
 * PATCH is partial. Ignore identical widget fields, but reject any mutation.
 * Removing unchanged fields avoids a write when the widget is switched off.
 */
export function preserveDisabledWidgetFieldsOnPatch(
  input: PatchAssistantConfigInput,
  existing: AssistantConfig | null,
): boolean {
  const values = input as unknown as WritableWidgetFields;
  for (const field of WIDGET_DESIGN_FIELDS) {
    if (values[field] !== undefined &&
        (!existing || !Object.is(values[field], existing[field]))) {
      return false;
    }
  }
  for (const field of WIDGET_DESIGN_FIELDS) {
    delete values[field];
  }
  return true;
}

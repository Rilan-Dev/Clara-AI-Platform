/**
 * src/modules/knowledge-bases/core/db.ts
 * All PostgreSQL queries for knowledge_bases and assistant_configs.
 */

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "@/lib/db";
import { getPlatformAssistantDefaults } from "@/modules/ai-core/assistant-defaults-db";
import type {
  KnowledgeBase, AssistantConfig, CreateKbInput, UpdateKbInput,
  PutAssistantConfigInput, PatchAssistantConfigInput,
} from "./models";
import { snapshotConfig } from "./snapshots-db";

function slugify(v: string): string {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,32)||"kb";
}
function makeCollectionName(kbId: string, name: string): string {
  return `kb_${kbId.replace(/-/g,"").slice(0,8)}_${slugify(name)}`;
}

// ── Row → model ───────────────────────────────────────────────────────────────

function toKb(row: Record<string,unknown>): KnowledgeBase {
  return {
    id: String(row.id), projectId: String(row.project_id),
    name: String(row.name), description: row.description!=null?String(row.description):null,
    qdrantCollection: String(row.qdrant_collection),
    status: (row.status as "active"|"archived")??"active",
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function str(v: unknown, fb: string): string { return v!=null?String(v):fb; }
function strN(v: unknown): string|null        { return v!=null?String(v):null; }
function num(v: unknown, fb: number): number  { return v!=null?Number(v):fb; }
function bool(v: unknown, fb: boolean): boolean { return v!=null?Boolean(v):fb; }

function toConfig(row: Record<string,unknown>): AssistantConfig {
  const rules: string[] = Array.isArray(row.rules)?(row.rules as string[]):[];
  const langs: string[] = Array.isArray(row.allowed_languages)?(row.allowed_languages as string[]):["en"];
  return {
    id: String(row.id), kbId: String(row.kb_id),
    assistantName: str(row.assistant_name,"Clara"),
    avatarUrl: strN(row.avatar_url),
    systemPrompt: str(row.system_prompt,""),
    welcomeMessage: str(row.welcome_message,"Hi! How can I help?"),
    outOfScopeReply: str(row.out_of_scope_reply,"I can only answer questions about this topic."),
    rules, defaultLanguage: str(row.default_language,"en"),
    allowedLanguages: langs, alwaysRespondIn: strN(row.always_respond_in),
    voiceId: str(row.voice_id,"alloy"), speed: num(row.speed,1),
    temperature: num(row.temperature,0.7), maxTokens: num(row.max_tokens,1000),
    citeSources: bool(row.cite_sources,true), strictMode: bool(row.strict_mode,false),
    primaryColour: str(row.primary_colour,"#6366f1"),
    accentColour: str(row.accent_colour,"#818cf8"),
    launcherColour: str(row.launcher_colour??row.primary_colour,"#6366f1"),
    widgetTheme: (row.widget_theme as "light"|"dark")??"light",
    widgetPosition: (row.widget_position as "bottom-right"|"bottom-left")??"bottom-right",
    widgetButtonSize: num(row.widget_button_size,56),
    widgetBorderRadius: num(row.widget_border_radius,20),
    widgetFontFamily: str(row.widget_font_family,"system-ui,sans-serif"),
    widgetChatHeight: num(row.widget_chat_height,580),
    widgetShowBranding: row.widget_show_branding!==false,
    widgetLauncherLabel: strN(row.widget_launcher_label),
    widgetMode: (row.widget_mode as "floating"|"inline"|"headless")??"floating",
    // ── Extended design ────────────────────────────────────────────────────────
    headerBg: strN(row.header_bg),
    headerTextColor: str(row.header_text_color,"#ffffff"),
    headerHeight: num(row.header_height,60),
    headerBlur: bool(row.header_blur,false),
    showStatusDot: bool(row.show_status_dot,true),
    statusDotColor: str(row.status_dot_color,"#4ade80"),
    avatarShape: (row.avatar_shape as "circle"|"rounded"|"square")??"circle",
    chatAreaBg: strN(row.chat_area_bg),
    userBubbleBg: strN(row.user_bubble_bg),
    userBubbleText: str(row.user_bubble_text,"#ffffff"),
    userBubbleRadius: str(row.user_bubble_radius,"18px 18px 4px 18px"),
    userBubblePadding: str(row.user_bubble_padding,"10px 14px"),
    userBubbleShadow: str(row.user_bubble_shadow,"0 1px 4px rgba(0,0,0,0.15)"),
    botBubbleBg: strN(row.bot_bubble_bg),
    botBubbleText: strN(row.bot_bubble_text),
    botBubbleRadius: str(row.bot_bubble_radius,"18px 18px 18px 4px"),
    botBubbleBorder: strN(row.bot_bubble_border),
    botBubblePadding: str(row.bot_bubble_padding,"10px 14px"),
    botBubbleShadow: str(row.bot_bubble_shadow,"0 1px 3px rgba(0,0,0,0.08)"),
    messageGap: num(row.message_gap,12),
    messageMaxWidth: num(row.message_max_width,85),
    messageFontSize: num(row.message_font_size,13),
    messageLineHeight: num(row.message_line_height,1.5),
    showTimestamps: bool(row.show_timestamps,false),
    timestampColor: str(row.timestamp_color,"#9ca3af"),
    timestampFontSize: num(row.timestamp_font_size,10),
    typingDotColor: str(row.typing_dot_color,"#9ca3af"),
    typingDotSize: num(row.typing_dot_size,6),
    inputBg: strN(row.input_bg),
    inputBorder: strN(row.input_border),
    inputBorderFocus: strN(row.input_border_focus),
    inputRadius: num(row.input_radius,12),
    inputTextColor: strN(row.input_text_color),
    inputPlaceholderColor: strN(row.input_placeholder_color),
    inputPadding: str(row.input_padding,"8px 12px"),
    inputAreaBg: strN(row.input_area_bg),
    inputAreaBorder: strN(row.input_area_border),
    sendBtnBg: strN(row.send_btn_bg),
    sendBtnHoverBg: strN(row.send_btn_hover_bg),
    sendBtnTextColor: str(row.send_btn_text_color,"#ffffff"),
    sendBtnRadius: num(row.send_btn_radius,10),
    sendBtnSize: num(row.send_btn_size,36),
    scrollbarWidth: num(row.scrollbar_width,4),
    scrollbarColor: str(row.scrollbar_color,"#c7d2fe"),
    scrollbarTrackColor: str(row.scrollbar_track_color,"transparent"),
    footerBg: strN(row.footer_bg),
    footerTextColor: strN(row.footer_text_color),
    animationsEnabled: bool(row.animations_enabled,true),
    messageAnimationStyle: (row.message_animation_style as "fade"|"slide"|"pop"|"none")??"fade",
    customCss: strN(row.custom_css),
    customLauncherSvg: strN(row.custom_launcher_svg),
    customHeaderHtml: strN(row.custom_header_html),
    customFooterHtml: strN(row.custom_footer_html),
    customThemeCss: strN(row.custom_theme_css),
    customInjectJs: strN(row.custom_inject_js),
    customPoweredBy: strN(row.custom_powered_by),
    // Voice mode design
    voiceBtnBg: strN(row.voice_btn_bg),
    voiceBtnSize: num(row.voice_btn_size, 36),
    voiceBtnRadius: num(row.voice_btn_radius, 10),
    voiceBtnActiveColor: strN(row.voice_btn_active_color),
    voicePanelBg: strN(row.voice_panel_bg),
    voiceWaveColor: strN(row.voice_wave_color),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}


// ── Knowledge Base CRUD ───────────────────────────────────────────────────────

/**
 * Create the KB's assistant_config seeded from the platform assistant
 * defaults (Identity / Behaviour / Language / Voice). Values are COPIED at
 * creation time — later default edits never rewrite existing KBs, and each
 * organisation keeps full control of the copy it now owns.
 *
 * Runs on the caller's transaction client so the KB row (inserted in the
 * same, still-open transaction) satisfies the FK.
 */
async function seedAssistantConfigFromDefaults(
  client: PoolClient,
  kbId: string,
): Promise<void> {
  const d = await getPlatformAssistantDefaults();
  await client.query(
    `INSERT INTO assistant_configs (
       kb_id, assistant_name, avatar_url, system_prompt, welcome_message,
       out_of_scope_reply, rules, default_language, allowed_languages,
       always_respond_in, voice_id, speed
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)`,
    [
      kbId,
      d.assistantName,
      d.avatarUrl,
      d.systemPrompt,
      d.welcomeMessage,
      d.outOfScopeReply,
      JSON.stringify(d.rules),
      d.defaultLanguage,
      d.allowedLanguages,
      d.alwaysRespondIn,
      // assistant_configs has NOT NULL constraints — empty platform defaults
      // fall back to the previous SQL column defaults.
      d.voiceId ?? "alloy",
      d.voiceSpeed ?? 1.0,
    ],
  );
}

export async function createKnowledgeBase(projectId: string, input: CreateKbInput): Promise<KnowledgeBase> {
  return withTransaction(async (client) => {
    const kbId = randomUUID();
    const kbResult = await client.query<Record<string,unknown>>(
      `INSERT INTO knowledge_bases (id, project_id, name, description, qdrant_collection)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [kbId, projectId, input.name, input.description??null, makeCollectionName(kbId,input.name)]
    );
    await seedAssistantConfigFromDefaults(client, kbId);
    return toKb(kbResult.rows[0]!);
  });
}

export async function listKnowledgeBases(projectId: string): Promise<KnowledgeBase[]> {
  const rows = await query<Record<string,unknown>>(
    "SELECT * FROM knowledge_bases WHERE project_id=$1 ORDER BY name ASC", [projectId]);
  return rows.map(toKb);
}

export async function getKnowledgeBaseById(id: string): Promise<KnowledgeBase|null> {
  const row = await queryOne<Record<string,unknown>>("SELECT * FROM knowledge_bases WHERE id=$1",[id]);
  return row?toKb(row):null;
}

export async function updateKnowledgeBase(id: string, input: UpdateKbInput): Promise<KnowledgeBase|null> {
  const sets: string[]=[]; const params: unknown[]=[]; let i=1;
  if (input.name!==undefined)        { sets.push(`name=$${i++}`);        params.push(input.name); }
  if (input.description!==undefined) { sets.push(`description=$${i++}`); params.push(input.description); }
  if (input.status!==undefined)      { sets.push(`status=$${i++}`);      params.push(input.status); }
  if (sets.length===0) return getKnowledgeBaseById(id);
  params.push(id);
  const row = await queryOne<Record<string,unknown>>(
    `UPDATE knowledge_bases SET ${sets.join(",")} WHERE id=$${i} RETURNING *`, params);
  return row?toKb(row):null;
}

export async function deleteKnowledgeBase(id: string): Promise<string|null> {
  const row = await queryOne<{qdrant_collection:string}>(
    "DELETE FROM knowledge_bases WHERE id=$1 RETURNING qdrant_collection",[id]);
  return row?row.qdrant_collection:null;
}

// ── Assistant Config CRUD ─────────────────────────────────────────────────────

export async function getAssistantConfig(kbId: string): Promise<AssistantConfig|null> {
  const row = await queryOne<Record<string,unknown>>(
    "SELECT * FROM assistant_configs WHERE kb_id=$1",[kbId]);
  return row?toConfig(row):null;
}

/** Full replace — PUT. Auto-snapshots current before writing. */
export async function putAssistantConfig(kbId: string, input: PutAssistantConfigInput): Promise<AssistantConfig> {
  const current = await getAssistantConfig(kbId);
  if (current) snapshotConfig(current).catch(()=>{});
  const row = await queryOne<Record<string,unknown>>(
    `UPDATE assistant_configs SET
       assistant_name=$1, avatar_url=$2, system_prompt=$3, welcome_message=$4,
       out_of_scope_reply=$5, rules=$6::jsonb, default_language=$7,
       allowed_languages=$8, always_respond_in=$9, voice_id=$10, speed=$11,
       temperature=$12, max_tokens=$13, cite_sources=$14, strict_mode=$15,
       primary_colour=$16, accent_colour=$17, launcher_colour=$18,
       widget_theme=$19, widget_position=$20, widget_button_size=$21,
       widget_border_radius=$22, widget_font_family=$23, widget_chat_height=$24,
       widget_show_branding=$25, widget_launcher_label=$26, widget_mode=$27,
       custom_css=$28, custom_launcher_svg=$29, custom_header_html=$30, custom_powered_by=$31
     WHERE kb_id=$32 RETURNING *`,
    [
      input.assistantName, input.avatarUrl??null, input.systemPrompt, input.welcomeMessage,
      input.outOfScopeReply, JSON.stringify(input.rules), input.defaultLanguage,
      input.allowedLanguages, input.alwaysRespondIn??null, input.voiceId, input.speed,
      input.temperature, input.maxTokens, input.citeSources, input.strictMode,
      input.primaryColour, input.accentColour, input.launcherColour??input.primaryColour,
      input.widgetTheme??"light", input.widgetPosition??"bottom-right",
      input.widgetButtonSize??56, input.widgetBorderRadius??20,
      input.widgetFontFamily??"system-ui,sans-serif", input.widgetChatHeight??580,
      input.widgetShowBranding??true, input.widgetLauncherLabel??null, input.widgetMode??"floating",
      input.customCss??null, input.customLauncherSvg??null, input.customHeaderHtml??null, input.customPoweredBy??null,
      kbId,
    ]
  );
  if (!row) throw new Error(`AssistantConfig not found for kbId ${kbId}`);
  return toConfig(row);
}


/** Partial update — PATCH. Only supplied fields are changed. */
export async function patchAssistantConfig(kbId: string, input: PatchAssistantConfigInput): Promise<AssistantConfig|null> {
  const current = await getAssistantConfig(kbId);
  if (current) snapshotConfig(current).catch(()=>{});

  // Complete field map: camelCase → snake_case
  const fieldMap: Record<string,string> = {
    assistantName:"assistant_name", avatarUrl:"avatar_url",
    systemPrompt:"system_prompt", welcomeMessage:"welcome_message",
    outOfScopeReply:"out_of_scope_reply", rules:"rules",
    defaultLanguage:"default_language", allowedLanguages:"allowed_languages",
    alwaysRespondIn:"always_respond_in", voiceId:"voice_id", speed:"speed",
    temperature:"temperature", maxTokens:"max_tokens",
    citeSources:"cite_sources", strictMode:"strict_mode",
    primaryColour:"primary_colour", accentColour:"accent_colour",
    launcherColour:"launcher_colour", widgetTheme:"widget_theme",
    widgetPosition:"widget_position", widgetButtonSize:"widget_button_size",
    widgetBorderRadius:"widget_border_radius", widgetFontFamily:"widget_font_family",
    widgetChatHeight:"widget_chat_height", widgetShowBranding:"widget_show_branding",
    widgetLauncherLabel:"widget_launcher_label", widgetMode:"widget_mode",
    // Extended design
    headerBg:"header_bg", headerTextColor:"header_text_color",
    headerHeight:"header_height", headerBlur:"header_blur",
    showStatusDot:"show_status_dot", statusDotColor:"status_dot_color",
    avatarShape:"avatar_shape", chatAreaBg:"chat_area_bg",
    userBubbleBg:"user_bubble_bg", userBubbleText:"user_bubble_text",
    userBubbleRadius:"user_bubble_radius", userBubblePadding:"user_bubble_padding",
    userBubbleShadow:"user_bubble_shadow",
    botBubbleBg:"bot_bubble_bg", botBubbleText:"bot_bubble_text",
    botBubbleRadius:"bot_bubble_radius", botBubbleBorder:"bot_bubble_border",
    botBubblePadding:"bot_bubble_padding", botBubbleShadow:"bot_bubble_shadow",
    messageGap:"message_gap", messageMaxWidth:"message_max_width",
    messageFontSize:"message_font_size", messageLineHeight:"message_line_height",
    showTimestamps:"show_timestamps", timestampColor:"timestamp_color",
    timestampFontSize:"timestamp_font_size",
    typingDotColor:"typing_dot_color", typingDotSize:"typing_dot_size",
    inputBg:"input_bg", inputBorder:"input_border",
    inputBorderFocus:"input_border_focus", inputRadius:"input_radius",
    inputTextColor:"input_text_color", inputPlaceholderColor:"input_placeholder_color",
    inputPadding:"input_padding", inputAreaBg:"input_area_bg",
    inputAreaBorder:"input_area_border",
    sendBtnBg:"send_btn_bg", sendBtnHoverBg:"send_btn_hover_bg",
    sendBtnTextColor:"send_btn_text_color", sendBtnRadius:"send_btn_radius",
    sendBtnSize:"send_btn_size",
    scrollbarWidth:"scrollbar_width", scrollbarColor:"scrollbar_color",
    scrollbarTrackColor:"scrollbar_track_color",
    footerBg:"footer_bg", footerTextColor:"footer_text_color",
    animationsEnabled:"animations_enabled",
    messageAnimationStyle:"message_animation_style",
    customCss:"custom_css", customLauncherSvg:"custom_launcher_svg",
    customHeaderHtml:"custom_header_html", customFooterHtml:"custom_footer_html",
    customThemeCss:"custom_theme_css", customInjectJs:"custom_inject_js",
    customPoweredBy:"custom_powered_by",
    // Voice mode design
    voiceBtnBg:"voice_btn_bg", voiceBtnSize:"voice_btn_size",
    voiceBtnRadius:"voice_btn_radius", voiceBtnActiveColor:"voice_btn_active_color",
    voicePanelBg:"voice_panel_bg", voiceWaveColor:"voice_wave_color",
  };

  const sets: string[]=[]; const params: unknown[]=[]; let i=1;
  for (const [key, col] of Object.entries(fieldMap)) {
    const val = (input as Record<string,unknown>)[key];
    if (val===undefined) continue;
    if (key==="rules")            { sets.push(`${col}=$${i++}::jsonb`); params.push(JSON.stringify(val)); }
    else if (key==="allowedLanguages") { sets.push(`${col}=$${i++}`); params.push(val as string[]); }
    else                          { sets.push(`${col}=$${i++}`);        params.push(val); }
  }

  if (sets.length===0) return getAssistantConfig(kbId);
  params.push(kbId);
  const row = await queryOne<Record<string,unknown>>(
    `UPDATE assistant_configs SET ${sets.join(",")} WHERE kb_id=$${i} RETURNING *`, params);
  return row?toConfig(row):null;
}

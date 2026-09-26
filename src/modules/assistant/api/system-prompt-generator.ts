/**
 * src/modules/assistant/api/system-prompt-generator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/agents/:agentId/system-prompt/generate
 *
 * "Generate system prompt from knowledge base": scans the knowledge bases
 * assigned to the agent (descriptions, document titles and a sample of the
 * indexed chunks) and drafts a system prompt in the shape of the template
 * the admin picked. With template "auto" the model first reads the same
 * sample and chooses the template that fits the content best.
 *
 * Body: { template: PromptTemplateId, notes?: string }
 * Returns: { prompt, template, reason?, documentsSampled }
 *
 * Nothing tenant-specific is hardcoded: the content comes from the tenant's
 * own knowledge base and the tenant's own chat model (AI Assistant settings)
 * writes it, so any provider works. The result is only a suggestion — the
 * editor shows it for review before it replaces the prompt.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAgentPermission, requireAuth } from "@/modules/auth/core/rbac";
import { getAgentById } from "@/modules/organisations/core/db";
import { getKnowledgeBaseDocumentTitles, listKnowledgeBases } from "@/modules/knowledge-bases/core/db";
import type { KnowledgeBase } from "@/modules/knowledge-bases/core/models";
import { getQdrantClient } from "@/modules/admin/core/vector-store";
import { resolveAIConfig, toProviderConfig } from "@/modules/ai-core/resolve";
import { ProviderFactory } from "@/modules/ai-core/factory";
import type { ProviderConfig } from "@/modules/ai-core/types";
import { hit, rateLimitResponse } from "@/lib/rate-limit";
import {
  CONCRETE_TEMPLATE_IDS,
  findPromptTemplate,
  type PromptTemplateId,
} from "@/modules/assistant/core/prompt-templates";

const SAMPLE_CHUNKS = 24;
const SNIPPET_CHARS = 500;
const MAX_TITLES = 30;
const MAX_NOTES_CHARS = 2000;
const TIMEOUT_MS = 50_000;
const RATE = { limit: 10, windowMs: 60_000 };

type KnowledgeSample = {
  descriptions: string[];
  titles: string[];
  excerpts: string[];
};

async function sampleKnowledge(kbs: KnowledgeBase[]): Promise<KnowledgeSample> {
  const perKb = Math.max(4, Math.ceil(SAMPLE_CHUNKS / Math.max(1, kbs.length)));
  const client = getQdrantClient();
  const results = await Promise.all(
    kbs.map(async (kb) => {
      const [titles, points] = await Promise.all([
        getKnowledgeBaseDocumentTitles(kb.id, MAX_TITLES).catch(() => [] as string[]),
        client
          .scroll(kb.qdrantCollection, { limit: perKb, with_payload: ["chunk", "title"], with_vector: false })
          .then((page) => page.points ?? [])
          .catch((err: unknown) => {
            console.warn("[system-prompt-generator] scroll failed:", (err as Error)?.message ?? err);
            return [];
          }),
      ]);
      const excerpts = points
        .map((point) => {
          const payload = (point.payload ?? {}) as { chunk?: unknown; title?: unknown };
          const chunk = typeof payload.chunk === "string" ? payload.chunk.replace(/\s+/g, " ").trim() : "";
          if (!chunk) return "";
          const title = typeof payload.title === "string" && payload.title ? `[${payload.title}] ` : "";
          return `${title}${chunk.slice(0, SNIPPET_CHARS)}`;
        })
        .filter(Boolean);
      return { description: kb.description?.trim() ?? "", titles, excerpts };
    }),
  );
  return {
    descriptions: results.map((r) => r.description).filter(Boolean),
    titles: [...new Set(results.flatMap((r) => r.titles))].slice(0, MAX_TITLES),
    excerpts: results.flatMap((r) => r.excerpts).slice(0, SAMPLE_CHUNKS),
  };
}

function knowledgeBlock(sample: KnowledgeSample): string {
  const parts: string[] = [];
  if (sample.descriptions.length) parts.push(`Knowledge base descriptions:\n${sample.descriptions.map((d) => `- ${d}`).join("\n")}`);
  if (sample.titles.length) parts.push(`Document titles:\n${sample.titles.map((t) => `- ${t}`).join("\n")}`);
  if (sample.excerpts.length) parts.push(`Excerpts:\n${sample.excerpts.map((e, i) => `(${i + 1}) ${e}`).join("\n")}`);
  return parts.join("\n\n");
}

async function complete(
  providerConfig: ProviderConfig | undefined,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const provider = ProviderFactory.getProvider(providerConfig);
  let output = "";
  for await (const chunk of provider.chatStream(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.2, maxTokens },
  )) {
    output += chunk;
  }
  return output.trim();
}

/** Picks the best template for the content. Never throws. */
export async function classifyKnowledge(
  providerConfig: ProviderConfig | undefined,
  knowledge: string,
): Promise<{ template: PromptTemplateId; reason: string }> {
  const catalogue = CONCRETE_TEMPLATE_IDS.map((id) => {
    const t = findPromptTemplate(id)!;
    return `- ${id}: ${t.description}`;
  }).join("\n");
  try {
    const raw = await complete(
      providerConfig,
      "You classify knowledge bases to choose the style of AI assistant that should serve them. " +
        `Choose exactly one id from this list:\n${catalogue}\n` +
        'Reply with JSON only: {"template":"<id>","reason":"<one short sentence>"}',
      knowledge,
      150,
    );
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    const parsed = json ? (JSON.parse(json) as { template?: unknown; reason?: unknown }) : {};
    const template = CONCRETE_TEMPLATE_IDS.find((id) => id === parsed.template);
    if (template) {
      return { template, reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "" };
    }
    const mentioned = CONCRETE_TEMPLATE_IDS.find((id) => raw.includes(id));
    if (mentioned) return { template: mentioned, reason: "" };
  } catch (err) {
    console.warn("[system-prompt-generator] classification failed:", (err as Error)?.message ?? err);
  }
  return { template: "customer_support", reason: "" };
}

export function buildGenerationPrompt(params: {
  template: PromptTemplateId;
  agentName: string;
  notes: string;
}): string {
  const template = findPromptTemplate(params.template)!;
  return [
    `You write system prompts for AI assistants. Write the system prompt for an assistant named "${params.agentName}".`,
    `Assistant type: ${template.label}. ${template.guidance}`,
    "Base everything about the organisation, audience, subjects and services ONLY on the knowledge base sample provided. " +
      "Name the organisation and its main subjects when the sample makes them clear.",
    "Never invent facts, contact details, prices, URLs, opening hours or policies that are not in the sample.",
    "Do NOT include rules about which language to reply in, and do NOT describe document retrieval, citations or search mechanics — the platform adds those automatically.",
    "Structure: a one-paragraph role statement, then short sections with headings such as Scope, How to answer, Tone, Boundaries and Escalation. " +
      "Use plain text with simple '-' bullets, written in the second person (\"You are…\"). Keep it under 600 words.",
    params.notes ? `Additional instructions from the administrator (follow them):\n${params.notes}` : "",
    "Reply with the system prompt only — no preamble, no code fences.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      const timer = setTimeout(() => resolve(null), ms);
      if (typeof timer.unref === "function") timer.unref();
    }),
  ]);
}

function cleanPrompt(text: string): string {
  return text
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

export async function generateSystemPromptHandler(request: NextRequest, agentId: string): Promise<NextResponse> {
  try {
    const auth = await requireAuth(request);
    await requireAgentPermission(auth, agentId, "project:update");

    const body = (await request.json().catch(() => ({}))) as { template?: unknown; notes?: unknown };
    const requested = findPromptTemplate(typeof body.template === "string" ? body.template : "auto");
    if (!requested) {
      return NextResponse.json({ error: "Unknown template." }, { status: 400 });
    }
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, MAX_NOTES_CHARS) : "";

    const gate = hit(`prompt-gen:${agentId}`, RATE.limit, RATE.windowMs);
    if (!gate.allowed) {
      const rl = rateLimitResponse(gate.retryAfterSec, "Too many prompt generations. Please try again shortly.");
      return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });
    }

    const [agent, allKbs] = await Promise.all([getAgentById(agentId), listKnowledgeBases(agentId)]);
    if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    const kbs = allKbs.filter((kb) => kb.status !== "archived");
    if (kbs.length === 0) {
      return NextResponse.json(
        { error: "This agent has no knowledge base yet. Add documents first, then generate the prompt." },
        { status: 409 },
      );
    }

    const sample = await sampleKnowledge(kbs);
    if (sample.excerpts.length === 0 && sample.titles.length === 0 && sample.descriptions.length === 0) {
      return NextResponse.json(
        { error: "The knowledge base has no indexed content yet. Wait for documents to finish processing and try again." },
        { status: 409 },
      );
    }
    const knowledge = knowledgeBlock(sample);

    // The admin is editing the draft, so generate with the draft's chat model.
    const resolved = await resolveAIConfig({ kbId: kbs[0]!.id, surface: "chat", preferDraft: true });
    const providerConfig = toProviderConfig(resolved);

    const result = await withTimeout(
      (async () => {
        const choice = requested.id === "auto"
          ? await classifyKnowledge(providerConfig, knowledge)
          : { template: requested.id, reason: "" };
        const prompt = cleanPrompt(
          await complete(
            providerConfig,
            buildGenerationPrompt({ template: choice.template, agentName: agent.name, notes }),
            `Knowledge base sample:\n\n${knowledge}`,
            1500,
          ),
        );
        return { ...choice, prompt };
      })(),
      TIMEOUT_MS,
    );
    if (!result || !result.prompt) {
      return NextResponse.json({ error: "The system prompt could not be generated. Please try again." }, { status: 502 });
    }

    return NextResponse.json({
      prompt: result.prompt,
      template: result.template,
      ...(result.reason ? { reason: result.reason } : {}),
      documentsSampled: sample.excerpts.length,
    });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[system-prompt-generator] failed:", error);
    return NextResponse.json({ error: "The system prompt could not be generated." }, { status: 500 });
  }
}

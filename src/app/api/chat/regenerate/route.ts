import { db } from "@/lib/db";
import { errorResponse, ApiError } from "@/lib/api-contract";
import { requireOrgUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { checkFeature, withQuota } from "@/lib/quota";
import { appendAudit } from "@/lib/audit";
import { appendUsageEvent } from "@/lib/usage";
import { streamChat } from "@/lib/chat-engine";

export const dynamic = "force-dynamic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * POST /api/chat/regenerate — reuses the same context and produces a fresh
 * completion, billed as a new turn (plan §3.5 acceptance).
 */
export async function POST(req: Request) {
  try {
    const { user, orgId } = await requireOrgUser(req);
    rateLimit(`chat:${user.id}`, 30);

    const body = (await req.json()) as {
      conversationId: string;
      idempotencyKey?: string | null;
    };
    if (!body.conversationId) {
      throw new ApiError(422, "VALIDATION_FAILED", "conversationId is required.", {
        fields: { conversationId: "Missing conversation." },
      });
    }

    const conversation = await db.conversation.findFirst({
      where: { id: body.conversationId, orgId },
    });
    if (!conversation) {
      throw new ApiError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
    }
    const agent = await db.agent.findFirst({
      where: { id: conversation.agentId, orgId },
    });
    if (!agent) {
      throw new ApiError(404, "AGENT_NOT_FOUND", "Agent not found.");
    }

    await checkFeature(orgId, `model:${agent.modelId}`);
    const daily = await withQuota({
      orgId,
      limitKey: "requests_day",
      idempotencyKey: body.idempotencyKey ?? null,
      endpoint: "POST /api/chat/regenerate",
    });
    const monthly = await withQuota({
      orgId,
      limitKey: "requests_month",
      endpoint: "POST /api/chat/regenerate",
    });

    const allMessages = await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    });
    const lastUser = [...allMessages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      throw new ApiError(422, "NO_PROMPT", "Nothing to regenerate yet.");
    }
    const history = allMessages
      .filter((m) => m.id !== lastUser.id && m.role === "user")
      .map((m) => ({
        role: "user" as const,
        content: m.content,
      }));

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) =>
          controller.enqueue(encoder.encode(sse(event, data)));
        send("start", {
          conversationId: conversation.id,
          quota: {
            requestsToday: daily.used,
            requestsTodayLimit: daily.limit,
            requestsMonth: monthly.used,
            requestsMonthLimit: monthly.limit,
          },
        });
        if (daily.warning || monthly.warning) {
          const w = daily.warning ?? monthly.warning;
          send("quota_warning", {
            limitKey: w!.limitKey,
            used: w!.used,
            limit: w!.limit,
            message: `You've used ${w!.used} of ${w!.limit} requests (80%). Consider upgrading before you hit the cap.`,
          });
        }
        try {
          const result = await streamChat({
            systemPrompt:
              agent.systemPrompt ||
              "You are Clara, a precise, helpful AI assistant for business teams. Answer concisely.",
            history,
            userMessage: lastUser.content,
            onToken: (chunk) => send("token", { text: chunk }),
            signal: req.signal,
          });
          const assistantMessage = await db.message.create({
            data: {
              conversationId: conversation.id,
              role: "assistant",
              content: result.text,
              truncated: result.cancelled,
              modelId: agent.modelId,
              promptTokens: result.promptTokens,
              completionTokens: result.completionTokens,
              latencyMs: result.latencyMs,
            },
          });
          await appendAudit({
            orgId,
            actorUserId: user.id,
            actorRole: user.role,
            action: "ANSWER",
            agentId: agent.id,
            conversationId: conversation.id,
            answerText: result.text || "(cancelled before first token)",
            model: agent.modelId,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
          });
          await appendUsageEvent({
            orgId,
            userId: user.id,
            kind: "CHAT",
            agentId: agent.id,
            model: agent.modelId,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            latencyMs: result.latencyMs,
            cancelled: result.cancelled,
          });
          send("done", {
            messageId: assistantMessage.id,
            cancelled: result.cancelled,
            usage: {
              promptTokens: result.promptTokens,
              completionTokens: result.completionTokens,
              latencyMs: result.latencyMs,
              firstTokenMs: result.firstTokenMs,
              model: agent.modelId,
            },
          });
        } catch (err) {
          const correlationId = `corr_${Date.now().toString(36)}`;
          console.error(
            JSON.stringify({
              level: "error",
              correlationId,
              route: "POST /api/chat/regenerate",
              message: err instanceof Error ? err.message : String(err),
            })
          );
          send("error", {
            code: "PROVIDER_ERROR",
            message: "The model provider failed mid-stream. Please regenerate.",
            correlationId,
          });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: SSE_HEADERS });
  } catch (err) {
    return errorResponse(err);
  }
}

import { NextResponse } from "next/server";
import { fetchOpenAIModelCatalog } from "@/modules/assistant/api/openai-catalog";

export async function GET(): Promise<NextResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  }

  try {
    const catalog = await fetchOpenAIModelCatalog(apiKey);
    return NextResponse.json(catalog, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("[openai/catalog]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to discover OpenAI capabilities" },
      { status: 502 },
    );
  }
}

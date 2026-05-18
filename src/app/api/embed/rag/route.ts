import { NextRequest, NextResponse } from "next/server";
import { validateEmbedRequest, buildCorsHeaders, handlePreflight } from "@/modules/embed/core/validate-embed";
import { postRagSearch } from "@/modules/assistant/api/rag";

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return handlePreflight(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Authenticate the embed widget via API key
  const validation = await validateEmbedRequest(req);
  if (!validation.ok) return validation.response;

  // 2. Add CORS headers
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin, validation.ctx.allowedOrigins, req.nextUrl.origin);

  // 3. Clone request, inject kbId from the API key context, and pass to the internal RAG logic
  try {
    const body = await req.json();
    body.kbId = validation.ctx.kbId;

    const modifiedReq = new NextRequest(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(body),
    });

    const response = await postRagSearch(modifiedReq);
    
    // Copy CORS headers to the response
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }
    
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid JSON body or internal error" },
      { status: 400, headers: corsHeaders }
    );
  }
}

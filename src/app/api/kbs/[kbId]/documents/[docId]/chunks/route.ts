import { ensureMigrated } from "@/lib/db/migrate";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireKbPermission } from "@/modules/auth/core/rbac";
import { getKnowledgeBaseById } from "@/modules/knowledge-bases/core/db";
import { getDocumentById } from "@/modules/knowledge-bases/core/documents-db";
import { listDocumentChunks, addChunk } from "@/modules/admin/core/vector-store-kb";
type Params={params:Promise<{kbId:string;docId:string}>};
export async function GET(req:NextRequest,{params}:Params){try{const {kbId,docId}=await params;const auth=await requireAuth(req);await requireKbPermission(auth,kbId,"document:read");const [kb,doc]=await Promise.all([getKnowledgeBaseById(kbId),getDocumentById(docId)]);if(!kb)return NextResponse.json({error:"Knowledge base not found"},{status:404});if(!doc||doc.kbId!==kbId)return NextResponse.json({error:"Document not found"},{status:404});const chunks=await listDocumentChunks(kb.qdrantCollection,docId);return NextResponse.json({documentId:docId,title:doc.title,chunkCount:chunks.length,chunks});}catch(err){if(err instanceof NextResponse)return err;console.error("[api/kbs/documents/chunks] request failed", err);return NextResponse.json({error:"Unable to load document chunks",code:"CHUNKS_READ_FAILED"},{status:502});}}
export async function POST(req:NextRequest,{params}:Params){try{await ensureMigrated();const {kbId,docId}=await params;const auth=await requireAuth(req);await requireKbPermission(auth,kbId,"document:create");const kb=await getKnowledgeBaseById(kbId);if(!kb)return NextResponse.json({error:"Knowledge base not found"},{status:404});const doc=await getDocumentById(docId);if(!doc||doc.kbId!==kbId)return NextResponse.json({error:"Document not found"},{status:404});const body = (await req.json().catch(() => null)) as { text?: unknown; chunkIndex?: unknown } | null;
if (typeof body?.text !== "string" || !body.text.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });
if (body.chunkIndex !== undefined && (typeof body.chunkIndex !== "number" || !Number.isSafeInteger(body.chunkIndex) || body.chunkIndex < 0)) {
  return NextResponse.json({ error: "chunkIndex must be a non-negative integer" }, { status: 400 });
}
const existing = await listDocumentChunks(kb.qdrantCollection, docId);
const requestedIndex: number | undefined = typeof body.chunkIndex === "number" ? body.chunkIndex : undefined;
const chunkIndex = requestedIndex ?? (existing.length ? Math.max(...existing.map(c => c.chunkIndex)) + 1 : 0);const pointId=await addChunk(kb.qdrantCollection,body.text.trim(),chunkIndex,{kbId,documentId:docId,title:doc.title,originalFilename:doc.originalFilename});return NextResponse.json({pointId,chunkIndex,text:body.text.trim()},{status:201});}catch(err){if(err instanceof NextResponse)return err;return NextResponse.json({error:(err as Error).message},{status:500});}}

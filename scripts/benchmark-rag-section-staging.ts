#!/usr/bin/env npx tsx
/**
 * Disposable, LOCAL-ONLY Qdrant semantic A/B for a complete source PDF.
 * Runs the same local Qwen embedding model, identical prompts, topK, chunk
 * size, page provenance and vector-search settings across both arms.
 *
 * The CLI deliberately REFUSES the live Qdrant port 6333 and any pre-existing
 * collections on the staging endpoint. Never uses Clara auth, tenant APIs,
 * migrations, vendor quotas, production index names, or source excerpt exports.
 * Stage Qdrant port 6335 must be a dedicated disposable Docker container.
 *
 * Usage:
 *   npx tsx scripts/benchmark-rag-section-staging.ts
 *
 * Optional --source <local.pdf>, --queries <local.json>,
 *          --page-range <first:last> (at most 12 adjacent pages). JSON array:
 *   [{ "id": "q01", "question": "...", "expectedPage": 4 }]
 */
import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFileAsText } from "../src/modules/admin/core/ingest/document-loader";
import { chunkDocumentWithPages } from "../src/modules/admin/core/ingest/chunker";

const MODEL = "Qwen/Qwen3-Embedding-0.6B";
const EMBED_URL = "http://127.0.0.1:8088/v1/embeddings";
const QDRANT_URL = "http://127.0.0.1:6335";
const MAX_FILE_BYTES = 5_000_000;
const CHUNK_SIZE = 900;
const OVERLAP = 150;

export type StagingQuestion = { id: string; question: string; expectedPage: number; expectedEvidence?: string[] };
type Chunk = { text: string; pageNumber?: number };
type Rank = { id: number | string; score: number; payload?: { pageNumber?: number } };

const DEFAULT_QUESTIONS: StagingQuestion[] = [
  {id:"q01",question:"How do I set up a new development environment?",expectedPage:3},
  {id:"q02",question:"What stages run in the CI/CD pipeline when merging to main?",expectedPage:4},
  {id:"q03",question:"What is the procedure for deploying to production?",expectedPage:5},
  {id:"q04",question:"How should an engineer roll back a failed deployment?",expectedPage:6},
  {id:"q05",question:"How should the database be backed up and restored?",expectedPage:7},
  {id:"q06",question:"Which monitoring tools and alerts are configured?",expectedPage:8},
  {id:"q07",question:"How does the on-call escalation process work?",expectedPage:9},
  {id:"q08",question:"What are the incident severity levels and response targets?",expectedPage:10},
];

function args(argv: string[]) {
  const input = {source:"public/seed-docs/techvision/Engineering-Runbook-v2.pdf",queries:"",pageRange:""};
  const seen = new Set<string>();
  for(let i=0;i<argv.length;i+=2) {
    const key = argv[i] === "--source" ? "source" : argv[i] === "--queries" ? "queries"
      : argv[i] === "--page-range" ? "pageRange" : null;
    if (!key || !argv[i+1] || seen.has(key) || argv[i+1]!.startsWith("--")) {
      throw new Error("Usage: --source <local.pdf> --queries <local.json> [--page-range first:last]");
    }
    seen.add(key);
    input[key] = argv[i+1]!;
  }
  return input;
}

export function validateQuestions(questions: StagingQuestion[], pageNumbers: number[]) {
  if (!Array.isArray(questions) || !questions.length || questions.length>32) throw new Error("Question count must be 1..32");
  const pages = new Set(pageNumbers);
  const ids = new Set<string>();
  for (const q of questions) {
    if (!q || typeof q.id !== "string" || !/^[a-z0-9_-]{1,30}$/i.test(q.id) ||
        ids.has(q.id) || typeof q.question !== "string" || !q.question.trim() ||
        q.question.length>1200 || !Number.isSafeInteger(q.expectedPage) ||
        !pages.has(q.expectedPage)) throw new Error("Invalid question or expected page");
    if (q.expectedEvidence !== undefined) {
      if (!Array.isArray(q.expectedEvidence) || !q.expectedEvidence.length ||
          q.expectedEvidence.length > 20 ||
          q.expectedEvidence.some(e => typeof e !== "string" || e.trim().length < 4 || e.length > 160) ||
          new Set(q.expectedEvidence.map(e => normalizeEvidence(e))).size !== q.expectedEvidence.length) {
        throw new Error("Invalid expected evidence labels");
      }
    }
    ids.add(q.id);
  }
}

/** Evaluates whether actual returned chunk text supports each expected source
 * phrase, not merely whether its PDF page is numerically correct.
 * No source content or labels are ever placed in the result or Qdrant payload. */
export function normalizeEvidence(text: string) {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}
export function evidenceCoverageAtK(
  rankedChunkText: readonly string[],
  expectedEvidence: readonly string[],
  k = 6,
) {
  if (!expectedEvidence.length || k < 1 || !Number.isInteger(k))
    throw new Error("Invalid evidence labels or rank limit");
  const normalized = rankedChunkText.slice(0, k).map(normalizeEvidence);
  const covered = expectedEvidence.filter(phrase => {
    const query = normalizeEvidence(phrase);
    return normalized.some(chunk => chunk.includes(query));
  }).length;
  return { required: expectedEvidence.length, covered, recall: covered / expectedEvidence.length,
    complete: covered === expectedEvidence.length };
}

export function pageHitRanks(ranks: Array<{pageNumber?:number}>, expectedPage:number, k=3) {
  const first = ranks.findIndex((r)=>r.pageNumber===expectedPage);
  return { hitAt1:first===0, hitAt3:first>=0&&first<k, reciprocalRank:first>=0?1/(first+1):0 };
}

function metrics(results: ReturnType<typeof pageHitRanks>[]) {
  const n=results.length;
  return {queries:n,accuracyAt1:results.filter(x=>x.hitAt1).length/n,
    recallAt3:results.filter(x=>x.hitAt3).length/n,
    meanReciprocalRank:Math.round(10000*results.reduce((s,x)=>s+x.reciprocalRank,0)/n)/10000};
}

export function assertLocalStagingUrl(url:string):void {
  const endpoint=new URL(url);
  if (endpoint.protocol!=="http:" || endpoint.hostname!=="127.0.0.1" ||
      ![8088,6335].includes(Number(endpoint.port)) ||
      endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error("Refusing non-local endpoint or unexpected port");
  }
}
async function localJSON(url:string, method="GET", data?:unknown):Promise<any> {
  assertLocalStagingUrl(url);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),45000);
  try {
    const response=await fetch(url,{method, ...(data===undefined?{}:{
      body:JSON.stringify(data), headers:{"content-type":"application/json"}
    }),signal:controller.signal});
    if(!response.ok) throw new Error("Local staging API HTTP "+response.status);
    return response.json();
  } finally {clearTimeout(timeout)}
}

const embedCache=new Map<string,number[]>();
async function embed(text:string):Promise<number[]> {
  const cached=embedCache.get(text);if(cached)return cached;
  const result=await localJSON(EMBED_URL,"POST",{model:MODEL,input:[text]});
  const vector=result?.data?.[0]?.embedding;
  if(!Array.isArray(vector) || vector.length<128 || vector.some((v:unknown)=>typeof v!=="number"||!Number.isFinite(v))) {
    throw new Error("Local embedding model returned invalid vector");
  }
  embedCache.set(text,vector);
  return vector;
}

async function qdrant(path:string, method="GET", payload?:unknown) {
  return localJSON(QDRANT_URL+path,method,payload);
}

async function run() {
  const options=args(process.argv.slice(2));
  const source=await realpath(resolve(options.source));
  if(extname(source).toLowerCase()!==".pdf")throw new Error("PDF source required");
  const bytes=await readFile(source);
  if(bytes.length>MAX_FILE_BYTES || !bytes.subarray(0,5).equals(Buffer.from("%PDF-")))throw new Error("PDF too large or invalid");
  // Require an EMPTY, separate disposable Qdrant instance: never index into
  // live production Qdrant, even if the operator misconfigured a port mapping.
  const initial=await qdrant("/collections");
  if(!Array.isArray(initial?.result?.collections)||initial.result.collections.length!==0) {
    throw new Error("Staging Qdrant must start with zero collections");
  }
  const parsed=await loadFileAsText(source);
  if(!parsed.pages?.length)throw new Error("Real PDF page metadata missing");
  const match=/^(\d{1,3}):(\d{1,3})$/.exec(options.pageRange);
  if(options.pageRange&&!match)throw new Error("Page range must be first:last");
  const first=match?Number(match[1]):1, last=match?Number(match[2]):parsed.pages.length;
  if(first<1||last<first||last-first>11||last>parsed.pages.length) {
    throw new Error("Page range must select 1..12 valid adjacent pages");
  }
  const scopedPages=parsed.pages.filter(p=>p.pageNumber>=first&&p.pageNumber<=last);
  if(!scopedPages.length)throw new Error("No pages in selected range");
  const selected={...parsed,pages:scopedPages};
  const questions=options.queries ? JSON.parse(await readFile(resolve(options.queries),"utf8")) : DEFAULT_QUESTIONS;
  validateQuestions(questions,scopedPages.map(p=>p.pageNumber));
  const arms=[
    {name:"legacy",sectionAware:false},
    {name:"sectionAware",sectionAware:true}
  ];
  const collectionNames:string[]=[];
  const baselineCounts:Record<string,number>={};
  const results:Record<string,ReturnType<typeof pageHitRanks>[]>={};
  const rankings:Record<string,Array<{
    id:string;ranking:number;matchedPage:boolean;
    coverageAt1?:number;coverageAt3?:number;coverageAt6?:number;fullCoverageAt6?:boolean;
  }>>={};
  let modelDimension:number|null=null;
  try {
    for(const arm of arms){
      const chunks:Chunk[]=chunkDocumentWithPages(selected,{chunkSize:CHUNK_SIZE,overlap:OVERLAP,sectionAware:arm.sectionAware});
      if(!chunks.length||chunks.some(c=>!c.pageNumber||c.text.length>CHUNK_SIZE))throw new Error("Invalid staging chunks/provenance");
      baselineCounts[arm.name]=chunks.length;
      const vectors:number[][]=[];
      for(let i=0;i<chunks.length;i++) vectors.push(await embed(chunks[i]!.text));
      const dim=vectors[0]!.length;
      if(modelDimension!==null&&modelDimension!==dim)throw new Error("Embedding dimension drift");
      modelDimension=dim;
      const collection="section_stage_"+randomUUID().replaceAll("-","").slice(0,12)+"_"+arm.name.toLowerCase();
      await qdrant("/collections/"+collection,"PUT",{vectors:{size:dim,distance:"Cosine"}});
      collectionNames.push(collection);
      const indexedText = new Map<string,string>();
      for(let i=0;i<chunks.length;i+=32){
        const batch=chunks.slice(i,i+32).map((chunk,j)=>({id:randomUUID(),vector:vectors[i+j],payload:{pageNumber:chunk.pageNumber}}));
        for (let j=0;j<batch.length;j++) indexedText.set(String(batch[j]!.id),chunks[i+j]!.text);
        await qdrant("/collections/"+collection+"/points?wait=true","PUT",{points:batch});
      }
      results[arm.name]=[];rankings[arm.name]=[];
      for(const question of questions as StagingQuestion[]){
        const vector=await embed(question.question);
        const search=await qdrant("/collections/"+collection+"/points/query","POST",{query:vector,limit:6,with_payload:true});
        const ranked:Rank[]=search?.result?.points;
        if(!Array.isArray(ranked))throw new Error("Missing staging search results");
        const pages=ranked.map((r)=>({pageNumber:r.payload?.pageNumber}));
        const rank=pageHitRanks(pages,question.expectedPage);
        results[arm.name]!.push(rank);
        const evidence = question.expectedEvidence?.length
          ? [1,3,6].map(k => evidenceCoverageAtK(
              ranked.slice(0,k).map(point => indexedText.get(String(point.id)) || ""),
              question.expectedEvidence!,k))
          : null;
        rankings[arm.name]!.push({
          id:question.id,ranking:rank.reciprocalRank?Math.round(1/rank.reciprocalRank):0,
          matchedPage:rank.hitAt3,
          ...(evidence ? {coverageAt1:evidence[0]!.recall,
            coverageAt3:evidence[1]!.recall,coverageAt6:evidence[2]!.recall,
            fullCoverageAt6:evidence[2]!.complete} : {}),
        });
      }
    }
    const legacy=metrics(results.legacy!);const section=metrics(results.sectionAware!);
    const summarizeEvidence=(rows:typeof rankings.legacy) => {
      const labeled=rows.filter(row=>row.coverageAt6!==undefined);
      const mean=(key:"coverageAt1"|"coverageAt3"|"coverageAt6") =>
        labeled.length?Math.round(10000*labeled.reduce((s,row)=>s+(row[key]||0),0)/labeled.length)/10000:null;
      return {labeledQuestions:labeled.length,meanRecallAt1:mean("coverageAt1"),
        meanRecallAt3:mean("coverageAt3"),meanRecallAt6:mean("coverageAt6"),
        fullyCoveredQuestionsAt6:labeled.filter(row=>row.fullCoverageAt6).length};
    };
    const comparison=(questions as StagingQuestion[]).map((q,i)=>({
      case:q.id, baselineRank:rankings.legacy![i]!.ranking,candidateRank:rankings.sectionAware![i]!.ranking,
      ...(q.expectedEvidence?.length ? { baselineEvidenceRecallAt6:rankings.legacy![i]!.coverageAt6,
        candidateEvidenceRecallAt6:rankings.sectionAware![i]!.coverageAt6 } : {}),
    }));
    console.log(JSON.stringify({
      kind:"isolated-local-qwen-qdrant-pdf-staging",
      fixture:source.includes("/seed-docs/") ? "repo-demo-pdf" : "local-pdf-reference-copy-unverified-revision",
      indexedPages:scopedPages.length,
      sourcePages:parsed.pages.length,
      embeddingModel:MODEL,
      vectorDimension:modelDimension,
      pageAware:true,
      chunkSize:CHUNK_SIZE,overlap:OVERLAP,
      legacyChunks:baselineCounts.legacy,sectionAwareChunks:baselineCounts.sectionAware,
      uniqueModelEmbeddings:embedCache.size,
      baseline:legacy,candidate:section,
      evidenceAssessment:{
        baseline:summarizeEvidence(rankings.legacy!),
        candidate:summarizeEvidence(rankings.sectionAware!),
        qualification:"Exact short-phrase containment in returned source chunks; not generated-answer correctness or independent reviewer relevance.",
      },
      deltaMRR:Number((section.meanReciprocalRank-legacy.meanReciprocalRank).toFixed(4)),
      perCase:comparison,
      tenantKBModified:false,
      sourceTextExported:false,
      limitation:"Page-label retrieval gate only, not verified answer quality; a local policy mirror may not be byte-identical to the tenant document",
    },null,2));
  } finally {
    // Purge only collections created by THIS invocation, inside the isolated
    // dedicated Qdrant instance; the shell also destroys that container.
    await Promise.all(collectionNames.map(async (name)=>{
      try{await qdrant("/collections/"+name,"DELETE")}catch{console.error("Cleanup warning for disposable staging collection")}
    }));
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error=>{console.error("Staging evaluation failed: "+(error as Error).message);process.exitCode=1});
}

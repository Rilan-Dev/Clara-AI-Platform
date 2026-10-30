#!/usr/bin/env node
/**
 * Fail-closed application-level acceptance preflight for an EXISTING,
 * explicitly named disposable RAG-STAGING-* tenant KB. No creation, upload,
 * reindex, deletion or permission bypass is performed.
 *
 * Default: read-only GET authentication, KB and document checks.
 * --execute: one quota-consuming POST /api/rag/search and one LLM-consuming
 * POST /api/chat (NDJSON) after ALL preflights pass. These may incur charges.
 *
 * This cannot prove uploaded PDF byte identity: Clara's document status API
 * does not expose original document bytes/digests. Its report ALWAYS records
 * uploadedRevisionVerified:false and manualReviewRequired:true.
 *
 * Never pass tokens on CLI. Set CLARA_DEBUG_TOKEN locally in a secure shell,
 * or enter it at a hidden interactive prompt.
 *
 * Usage:
 *   node scripts/rag-tenant-acceptance.mjs --kb-id UUID
 *   node scripts/rag-tenant-acceptance.mjs --kb-id UUID --execute
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_URL = "https://clara.ai.amazetechclans.com";
const QUESTION = "List all seven requirements of DO.4.2 Disaster Recovery. " +
  "Provide a numbered answer using evidence from both pages with source citations.";
export const MARKERS = [
  "prioritized list of information systems",
  "assignment of roles responsible",
  "actions to be taken to activate",
  "actions to be taken to reduce the damage",
  "recovery point objectives",
  "recovery time objectives",
  "definition of recovery activities",
];

const normalize = s => String(s || "").normalize("NFKC").replace(/\s+/g," ").trim().toLowerCase();
export function scoreEvidence(sources, markers = MARKERS) {
  if (!Array.isArray(sources)) return {covered:0,required:markers.length,withPage:0,total:0,expectedPagesCovered:0};
  const excerpts = sources.map(s => normalize(s?.snippet));
  const pages = new Set(sources.filter(s=>Number.isSafeInteger(s?.pageNumber)&&s.pageNumber>0).map(s=>s.pageNumber));
  return {
    required:markers.length, covered:markers.filter(m=>excerpts.some(e=>e.includes(normalize(m)))).length,
    withPage:sources.filter(s=>Number.isSafeInteger(s?.pageNumber)&&s.pageNumber>0).length,
    total:sources.length, expectedPagesCovered:[60,61].filter(p=>pages.has(p)).length,
  };
}

export function scoreNdjson(body) {
  if (typeof body !== "string" || Buffer.byteLength(body,"utf8")>2_000_000)
    throw new Error("Chat stream missing or too large");
  let answer="", done=false, errors=0, sources=0;
  for(const line of body.split(/\r?\n/)) {
    if(!line.trim()) continue;
    let event;
    try{event=JSON.parse(line)}catch{throw new Error("Invalid NDJSON event")}
    if(event?.type==="token" && typeof event.payload==="string"){
      answer+=event.payload;
      if(answer.length>100_000)throw new Error("Answer exceeds safety limit");
    }
    if(event?.type==="sources" && Array.isArray(event.payload))sources=event.payload.length;
    if(event?.type==="error")errors++;
    if(event?.type==="done")done=true;
  }
  // No answer text, source excerpts or request IDs in the report.
  return {done,errors,answerChars:answer.length,sourceCount:sources,
    markerMatches:MARKERS.filter(m=>normalize(answer).includes(normalize(m))).length,
    citationTagCount:(answer.match(/\[S\d+\]/g)||[]).length};
}

function bearer(token) {
  const bare=String(token||"").replace(/^Bearer\s+/i,"").trim();
  if(!bare || /[\r\n]/.test(bare) || /^clara_platform_token=/i.test(bare))
    throw new Error("Expected a raw Clara session token");
  return {Authorization:"Bearer "+bare,Accept:"application/json"};
}
export function parseArgs(args) {
  const opts={baseUrl:DEFAULT_URL,scope:"draft",topK:12,execute:false};
  const fields={"--kb-id":"kbId","--base-url":"baseUrl","--scope":"scope","--top-k":"topK","--source":"source"};
  for(let i=0;i<args.length;i++){
    const a=args[i];
    if(a==="--help")return {help:true};
    if(a==="--execute"){opts.execute=true;continue}
    if(!(a in fields) || !args[i+1] || args[i+1].startsWith("--"))throw new Error("Invalid CLI argument");
    opts[fields[a]]=args[++i];
  }
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.kbId||""))
    throw new Error("Expected a staging KB UUID");
  if(!["draft","live"].includes(opts.scope))throw new Error("Invalid scope");
  if(!Number.isInteger(Number(opts.topK))||Number(opts.topK)<7||Number(opts.topK)>20)
    throw new Error("topK must be 7..20");
  opts.topK=Number(opts.topK);
  let url;
  try{url=new URL(opts.baseUrl)}catch{throw new Error("Invalid origin")}
  if(url.pathname!=="/" || url.username || url.password || url.search || url.hash ||
     !(url.protocol==="https:" || (url.protocol==="http:" && url.hostname==="127.0.0.1")))
    throw new Error("Only HTTPS origin or loopback HTTP is allowed");
  opts.baseUrl=url.origin;
  return opts;
}

async function fetchResponse(fetcher, url, token, options={}) {
  let response;
  try {
    response=await fetcher(url,{
      method:options.method??"GET",redirect:"manual",
      headers:{...bearer(token),...(options.body?{"Content-Type":"application/json"}:{})},
      ...(options.body?{body:JSON.stringify(options.body)}:{}),
      signal:AbortSignal.timeout(90000),
    });
  } catch {throw new Error("Connection failed")}
  if(!response || typeof response.status!=="number")throw new Error("Invalid response");
  if(!response.ok)throw new Error(
    response.status===401?"Authentication rejected":
    response.status===403?"Tenant authorization denied":
    "API request failed (HTTP "+response.status+")");
  return response;
}
async function getJSON(fetcher,url,token,options) {
  const response=await fetchResponse(fetcher,url,token,options);
  try{return await response.json()}catch{throw new Error("Invalid JSON response")}
}
export async function runTenantAcceptance(opts,token,fetcher=fetch) {
  const base=opts.baseUrl;
  const data={kind:"clara-tenant-staging-acceptance-v1",readOnly:!opts.execute,
    tenantAuthPassed:false,stagingKbVerified:false,documentReady:false,
    uploadedRevisionVerified:false,manualReviewRequired:true,
    retrieval:null,chat:null,releaseApproved:false};
  // /auth/me only establishes identity; KB GET must separately authorize.
  const me=await getJSON(fetcher,base+"/api/auth/me",token);
  if(!me?.user || typeof me.user!=="object")throw new Error("Session identity missing");
  data.tenantAuthPassed=true;
  const kb=await getJSON(fetcher,base+"/api/kbs/"+opts.kbId,token);
  if(kb?.id!==opts.kbId || typeof kb.name!=="string" ||
     !kb.name.startsWith("RAG-STAGING-") || kb.status!=="active")
    throw new Error("Expected an active RAG-STAGING-* KB owned by the authenticated tenant");
  data.stagingKbVerified=true;
  const docs=await getJSON(fetcher,base+"/api/kbs/"+opts.kbId+"/documents",token);
  if(!Array.isArray(docs) || docs.length!==1 ||
     docs[0]?.status!=="ready" ||
     docs[0]?.originalFilename!=="PoliciesEn001.pdf")
    throw new Error("Expected one ready English policy PDF in the disposable staging KB");
  data.documentReady=true;
  if(opts.source){
    const file=await readFile(resolve(opts.source));
    const hash=createHash("sha256").update(file).digest("hex");
    data.localSourceSha256=hash; // public file digest, never claimed as uploaded digest
  }
  if(!opts.execute)return data;
  const rag=await getJSON(fetcher,base+"/api/rag/search",token,{
    method:"POST",body:{kbId:opts.kbId,query:QUESTION,topK:opts.topK,
      scope:opts.scope,channel:"chat"},
  });
  const evidence=scoreEvidence(rag?.sources);
  data.retrieval={
    grounded:rag?.grounded===true,...evidence,
    evidenceComplete:evidence.covered===evidence.required,
    pagesPresent:evidence.total>0 && evidence.total===evidence.withPage,
    crossPageEvidence:evidence.expectedPagesCovered===2,
  };
  if(!data.retrieval.grounded || !data.retrieval.evidenceComplete ||
     !data.retrieval.pagesPresent || !data.retrieval.crossPageEvidence)
    return data; // fail closed; do not incur additional LLM costs
  const chatResponse=await fetchResponse(fetcher,base+"/api/chat",token,{
    method:"POST",body:{kbId:opts.kbId,scope:opts.scope,
      messages:[{role:"user",content:QUESTION}]},
  });
  let body;
  try {body=await chatResponse.text()}catch{throw new Error("Chat stream read failed")}
  data.chat=scoreNdjson(body);
  // Generated-answer citation/semantic correctness MUST still be independently
  // reviewed against the exact user-uploaded PDF; heuristic never approves.
  return data;
}
function hiddenToken() {
  if(!process.stdin.isTTY || !process.stdout.isTTY ||
     typeof process.stdin.setRawMode!=="function")
    throw new Error("Set CLARA_DEBUG_TOKEN in your local terminal or use interactive hidden input");
  return new Promise((resolve,reject)=>{
    const stdin=process.stdin,prev=Boolean(stdin.isRaw);
    let text="",finished=false;
    function stop(err){if(finished)return;finished=true;
      stdin.off("data",onData);stdin.setRawMode(prev);stdin.pause();
      process.stdout.write("\n");
      if(err||!text.trim())reject(new Error("Session input cancelled or empty"));
      else resolve(text.trim());
    }
    function onData(chunk){for(const c of chunk.toString("utf8")){
      if(c==="\r"||c==="\n"){stop();return}
      if(c==="\u0003"||c==="\u0004"){stop(true);return}
      if(c==="\u007f"){text=text.slice(0,-1);continue}
      if(c>=" "&&c<="~")text+=c;
      if(text.length>8192){stop(true);return}
    }}
    stdin.setRawMode(true);stdin.on("data",onData);stdin.resume();
    process.stdout.write("Tenant session token (hidden): ");
  });
}
async function main(){
  const opts=parseArgs(process.argv.slice(2));
  if(opts.help){console.log("Usage: node scripts/rag-tenant-acceptance.mjs --kb-id UUID [--source original.pdf] [--scope draft|live] [--execute]");return}
  const token=process.env.CLARA_DEBUG_TOKEN||await hiddenToken();
  try {
    const result=await runTenantAcceptance(opts,token);
    console.log(JSON.stringify(result,null,2));
    if(opts.execute && (!result.retrieval?.evidenceComplete ||
      !result.retrieval?.pagesPresent || !result.retrieval?.crossPageEvidence ||
      !result.chat?.done || result.chat.errors || !result.chat.citationTagCount))
      process.exitCode=2;
  } catch(error){
    // Strict allowlist so error logs cannot disclose token, response content,
    // unexpected URLs, private names or network exception messages.
    const reason=error?.message||"";
    const safe=[
      "Authentication rejected","Tenant authorization denied",
      "Session identity missing","Connection failed","Invalid JSON response",
      "Expected one ready English policy PDF in the disposable staging KB",
      "Expected an active RAG-STAGING-* KB owned by the authenticated tenant",
      "Chat stream read failed",
    ];
    console.error(safe.includes(reason)?reason:"Staging acceptance preflight failed");
    process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(()=>{console.error("Staging acceptance unavailable");process.exitCode=1});

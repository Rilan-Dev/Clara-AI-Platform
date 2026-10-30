#!/usr/bin/env node
/**
 * Run ONLY under a tenant-authenticated Clara organization account.
 *
 * Uses normal RBAC-protected HTTP APIs, never DB inserts or test sessions.
 * No credentials are accepted as CLI arguments or printed.
 *
 *   node scripts/rag-staging-setup.mjs --action create --agent-id UUID
 *   node scripts/rag-staging-setup.mjs --action upload --kb-id UUID --source /private/PoliciesEn001.pdf
 *   node scripts/rag-staging-setup.mjs --action status --kb-id UUID
 *
 * Upload requires the worker's exact-KB page+section staging-only override
 * already active. Original PDF path is mandatory; no public mirror fallback.
 * Does not delete any tenant KB or claim final acceptance.
 */
import { randomUUID, createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ORIGIN = "https://clara.ai.amazetechclans.com";
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const NAME_PREFIX = "RAG-STAGING-DO42-";
const MAX_UPLOAD = 50 * 1024 * 1024;

export function parseArgs(argv) {
  if(argv.includes("--help"))return {help:true};
  const o={};
  for(let i=0;i<argv.length;i+=2){
    const key=argv[i],value=argv[i+1];
    if(!["--action","--agent-id","--kb-id","--source"].includes(key)||
       !value||value.startsWith("--")||Object.hasOwn(o,key))throw Error("Invalid setup arguments");
    o[key]=value;
  }
  const action=o["--action"];
  if(!["create","upload","status"].includes(action))throw Error("Action must be create, upload or status");
  if(action==="create" ? !UUID.test(o["--agent-id"]||"") || o["--kb-id"] || o["--source"] :
     !UUID.test(o["--kb-id"]||"") || o["--agent-id"] ||
       (action==="upload" ? !o["--source"] : !!o["--source"]))
    throw Error("Missing or conflicting stage arguments");
  return {action,agentId:o["--agent-id"],kbId:o["--kb-id"],source:o["--source"]};
}

export function validateWorkerStage(raw, kbId) {
  let e;
  try{e=typeof raw==="string"?JSON.parse(raw):raw}catch{throw Error("Staging worker validation unavailable")}
  if(!e||typeof e!=="object"||
     e.stageEnabled!==true ||
     typeof e.stageId!=="string" ||
     e.stageId.toLowerCase()!==kbId.toLowerCase() ||
     e.globalPage===true || e.globalSection===true)
    throw Error("Worker not exclusively configured for this staging KB");
  return true;
}

export function inspectWorkerStage(kbId) {
  // Only these four known configuration fields are disclosed by the worker.
  // Never run printenv, docker inspect of all env, or read the secret .env file.
  const source = [
    "const e=process.env;",
    "console.log(JSON.stringify({",
    "stageEnabled:e.RAG_STAGING_PAGE_SECTION_CHUNKING==='true',",
    "stageId:e.RAG_STAGING_KB_ID||'',",
    "globalPage:e.RAG_SOURCE_PAGE_CHUNKING==='true',",
    "globalSection:e.RAG_SECTION_AWARE_CHUNKING==='true'}))",
  ].join("");
  let raw;
  try{
    raw=execFileSync("docker",["exec","clara-worker","node","-e",source],{
      encoding:"utf8",timeout:8000,stdio:["ignore","pipe","ignore"],maxBuffer:10000,
    });
  }catch{throw Error("Unable to verify the active staging worker flags")}
  return validateWorkerStage(raw,kbId);
}

function auth(token){
  const value=String(token||"").replace(/^Bearer\s+/i,"").trim();
  if(!value||/[\r\n]/.test(value)||value.length>8192||/^clara_platform_token=/i.test(value))
    throw Error("Invalid tenant session");
  return {Authorization:"Bearer "+value,Accept:"application/json"};
}
async function request(fetcher,token,path,{method="GET",body}={}){
  if(!path.startsWith("/api/")||path.includes(".."))throw Error("Invalid API route");
  let response;
  try{
    response=await fetcher(ORIGIN+path,{method,headers:{
      ...auth(token),
      ...(body && !(body instanceof FormData)?{"Content-Type":"application/json"}:{}),
    },...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),
    redirect:"manual",signal:AbortSignal.timeout(90000)});
  }catch{throw Error("Clara API request failed")}
  if(!response?.ok)throw Error(
    response?.status===401?"Tenant session rejected":
    response?.status===403?"Tenant permission denied":
    "Clara API returned an unsuccessful status");
  try{return await response.json()}catch{throw Error("Malformed Clara API response")}
}
function verifyStaging(kb,kbId){
  if(!kb||kb.id!==kbId||!kb.name?.startsWith("RAG-STAGING-")||kb.status!=="active")
    throw Error("Expected an active disposable staging KB");
}
export async function runSetup(opts,token,{
  fetcher=fetch,checkWorker=inspectWorkerStage,
  readSource=readFile,statSource=stat,now=()=>new Date(),createId=randomUUID,
}={}) {
  const me=await request(fetcher,token,"/api/auth/me");
  if(!me?.user||me.user.isSuperAdmin===true)throw Error("An authorized non-platform tenant session is required");
  if(opts.action==="create"){
    // This normal API GET also verifies the caller can see this agent.
    const agent=await request(fetcher,token,"/api/agents/"+opts.agentId);
    if(agent?.id!==opts.agentId)throw Error("Agent is unavailable");
    const name=NAME_PREFIX+now().toISOString().slice(0,10)+"-"+createId().slice(0,8);
    const kb=await request(fetcher,token,"/api/agents/"+opts.agentId+"/kbs",{
      method:"POST",body:{name,description:"Isolated DO.4.2 ingestion and citation acceptance. Do not publish."},
    });
    if(!UUID.test(kb?.id||"")||kb?.name!==name)throw Error("Unexpected staging creation response");
    return {action:"create",kbId:kb.id,stagingName:name,created:true,
      next:"Configure the worker for this exact staging KB before uploading the original policy PDF.",
      productionKbTouched:false,releaseApproved:false};
  }
  const kb=await request(fetcher,token,"/api/kbs/"+opts.kbId);
  verifyStaging(kb,opts.kbId);
  const docs=await request(fetcher,token,"/api/kbs/"+opts.kbId+"/documents");
  if(!Array.isArray(docs))throw Error("Unexpected document-list response");
  if(opts.action==="status")return {
    action:"status",kbId:opts.kbId,documents:docs.length,
    pending:docs.filter(x=>x.status==="pending"||x.status==="processing").length,
    ready:docs.filter(x=>x.status==="ready").length,
    failed:docs.filter(x=>x.status==="failed").length,
    productionKbTouched:false,releaseApproved:false,
  };
  if(docs.length!==0)throw Error("Only empty disposable staging KBs can be uploaded");
  if(basename(opts.source)!=="PoliciesEn001.pdf")
    throw Error("Source filename must be the original PoliciesEn001.pdf");
  // Check before reading or sending any data: never silently index with the
  // legacy worker if the exact stage override was not applied.
  await checkWorker(opts.kbId);
  const file=resolve(opts.source);
  const info=await statSource(file);
  if(!info.isFile()||info.size<1000||info.size>MAX_UPLOAD)
    throw Error("Original PDF size or file type invalid");
  const bytes=await readSource(file);
  if(bytes.length!==info.size || bytes.subarray(0,5).toString("latin1")!=="%PDF-")
    throw Error("Source is not an intact PDF");
  const sha256=createHash("sha256").update(bytes).digest("hex");
  const data=new FormData();
  data.append("file",new Blob([bytes],{type:"application/pdf"}),"PoliciesEn001.pdf");
  const result=await request(fetcher,token,"/api/kbs/"+opts.kbId+"/documents",{
    method:"POST",body:data,
  });
  if(!Array.isArray(result?.queued)||result.queued.length!==1||result.errors?.length)
    throw Error("Document was not accepted cleanly; check stage status");
  return {action:"upload",kbId:opts.kbId,uploaded:true,
    localSourceSha256:sha256,uploadedDigestVerified:false,
    ingestQueued:true,productionKbTouched:false,releaseApproved:false,
    next:"Wait for a ready status, then run the existing tenant RAG and streamed-chat acceptance verifier.",
  };
}

function promptSecret(){
  if(!process.stdin.isTTY||!process.stdout.isTTY||
     typeof process.stdin.setRawMode!=="function")
    throw Error("Run in a local interactive terminal, or set CLARA_DEBUG_TOKEN securely");
  return new Promise((res,rej)=>{
    const stdin=process.stdin,previous=!!stdin.isRaw;let value="",closed=false;
    const finish=(error)=>{if(closed)return;closed=true;stdin.off("data",handle);
      stdin.setRawMode(previous);stdin.pause();process.stdout.write("\n");
      error||!value?rej(Error("Session input cancelled")):res(value);};
    const handle=chunk=>{for(const c of chunk.toString("utf8")){
      if(c==="\n"||c==="\r"){finish();return}
      if(c==="\u0003"||c==="\u0004"){finish(true);return}
      if(c==="\u007f"){value=value.slice(0,-1);continue}
      if(c>=" "&&c<="~")value+=c;
      if(value.length>8192){finish(true);return}
    }};
    stdin.setRawMode(true);stdin.on("data",handle);stdin.resume();
    process.stdout.write("Tenant session (hidden): ");
  });
}
async function main(){
  let opts;
  try{opts=parseArgs(process.argv.slice(2))}catch{
    console.error("Invalid arguments. Use --help");process.exitCode=1;return;
  }
  if(opts.help){
    console.log("Actions: --action create --agent-id UUID | --action upload --kb-id UUID --source /private/PoliciesEn001.pdf | --action status --kb-id UUID");
    return;
  }
  let token;
  try{token=process.env.CLARA_DEBUG_TOKEN||await promptSecret()}catch{
    console.error("No private tenant session available");process.exitCode=1;return;
  }
  try{console.log(JSON.stringify(await runSetup(opts,token),null,2))}
  catch(error){
    const allowed=new Set([
      "An authorized non-platform tenant session is required",
      "Agent is unavailable","Tenant session rejected","Tenant permission denied",
      "Expected an active disposable staging KB","Only empty disposable staging KBs can be uploaded",
      "Source filename must be the original PoliciesEn001.pdf",
      "Worker not exclusively configured for this staging KB",
      "Unable to verify the active staging worker flags",
      "Original PDF size or file type invalid","Source is not an intact PDF",
      "Document was not accepted cleanly; check stage status",
    ]);
    console.error(allowed.has(error?.message)?error.message:"Staging setup was not completed");
    process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(()=>{console.error("Staging setup unavailable");process.exitCode=1});

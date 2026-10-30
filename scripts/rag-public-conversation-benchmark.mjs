#!/usr/bin/env node
/**
 * Live, PUBLIC PUBLISHED-AGENT QA benchmark against an operator-reviewed PDF
 * golden set. Uses ONLY the existing public config + signed published session
 * flow, NEVER tenant impersonation, raw DB sessions or authorization bypass.
 *
 * Test is quota-consuming. Serial execution and a small delay avoid flooding
 * the public LLM endpoint. Do not commit generated reports (responses/sources).
 *
 * Usage:
 * node scripts/rag-public-conversation-benchmark.mjs --dry-run
 * node scripts/rag-public-conversation-benchmark.mjs --limit 12 --out /tmp/ndmo-report.json
 * node scripts/rag-public-conversation-benchmark.mjs --case do42-en-seven --repeats 3
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const BASE="https://clara.ai.amazetechclans.com";
const FIXTURE = new URL("./fixtures/ndmo-ar-v15-public-chat-benchmark.json",import.meta.url);
const REFUSAL = /(?:not.{0,30}(?:specif|stated|provided|available|in the document)|(?:cannot|can't|unable|don't have|do not have).{0,90}(?:information|answer|access)|insufficient.{0,35}information|no (?:such|specific|exact) (?:amount|value|number)|لا (?:يحدد|يوجد|توجد|يمكن)|غير (?:مذكور|محدد|متوفر)|لم (?:يذكر|يحدد)|لا تتضمن)/iu;
const STOP = /(?:\\b(?:not|cannot|can't|unable|don't|do not)\\b.{0,70}\\b(?:find|available|enough information|answer)\\b|(?:I cannot|I'm unable)|(?:لا أستطيع|لا يمكن|غير كاف|لا توجد معلومات))/iu;
const ARABIC=/[\u0600-\u06ff]/u;

export function normalizeText(input){
  return String(input??"").normalize("NFKC")
    .replace(/[\u064b-\u065f\u0670\u0640]/g,"")
    .replace(/[أإآ]/g,"ا").replace(/ى/g,"ي")
    .replace(/[٠-٩]/g,x=>String(x.charCodeAt(0)-0x660))
    .replace(/\s+/g," ").trim().toLowerCase();
}
export function scoreCase(test, answer, sources, streamed) {
  const normalized=normalizeText(answer);
  const checks=(test.checks??[]).map(rule=>{
    let hit=false;
    try{hit=new RegExp(rule.regex.replace(/[أإآ]/g,"ا").replace(/ى/g,"ي"),"iu").test(normalized)}
    catch {throw Error("Invalid golden answer regex: "+rule.key)}
    return {key:rule.key,hit};
  });
  const hits=checks.filter(x=>x.hit).length;
  const coverage=checks.length?Math.round(1000*hits/checks.length)/1000:null;
  const cited=[...answer.matchAll(/\[S(\d+)\]/gi)].map(m=>Number(m[1]));
  const validCitations=cited.length>0&&cited.every(n=>n>=1&&n<=sources.length);
  const pageSources=sources.filter(s=>Number.isInteger(s?.pageNumber)&&s.pageNumber>0);
  const expected=(test.pages??[]);
  const pageHits=expected.filter(page=>pageSources.some(s=>s.pageNumber===page));
  const namedSourceHits=sources.filter(s=>/SDAIA NDMO Policies Ar 001|Data Standards Document|PoliciesEn001\.pdf/i.test(String(s?.title??s?.originalFilename??""))).length;
  const refused=STOP.test(normalized)||REFUSAL.test(normalized);
  const abstain=test.expect==="abstain";
  const negativeSuccess=abstain&&refused;
  const nonRefusalSuccess=!abstain&&streamed.done&&streamed.errors===0&&!STOP.test(normalized)&&coverage===1;
  const success=abstain?negativeSuccess:nonRefusalSuccess;
  return {
    expected:abstain?"abstain":"answer",
    conceptsFound:hits,conceptsTotal:checks.length,conceptRecall:coverage,
    conceptChecks:checks,
    refused,success,
    citationsFound:cited.length,citationsInRange:validCitations,
    sourcesCount:sources.length,sourcePageMetadataCount:pageSources.length,
    expectedPages:expected,expectedPagesFound:pageHits,
    sourceDocumentMatches:namedSourceHits,
    arabicAnswer:ARABIC.test(answer),
    qualification:"Heuristic concepts, refusal and citation markers are not equivalent to independent evidence or citation correctness review.",
  };
}
export function parseStream(body) {
  if(Buffer.byteLength(body,"utf8")>2_000_000)throw Error("Excessive response size");
  let answer="",sources=[],done=false,errors=0,tokenEvents=0,unknown=0;
  for(const line of body.split(/\r?\n/)){
    if(!line.trim())continue;
    let event;
    try{event=JSON.parse(line)}catch{throw Error("Invalid streamed NDJSON")}
    if(event.type==="token"){if(typeof event.payload==="string"){answer+=event.payload;tokenEvents++}}
    else if(event.type==="sources"){if(Array.isArray(event.payload))sources=event.payload}
    else if(event.type==="done")done=true;
    else if(event.type==="error")errors++;
    else unknown++;
    if(answer.length>110000||sources.length>150)throw Error("Oversized streamed event");
  }
  return {answer,sources,done,errors,tokenEvents,unknown};
}
export function parseArgs(args){
  const o={limit:12,repeats:1,delayMs:850,timeoutMs:85000,dryRun:false,caseId:null,out:null};
  for(let i=0;i<args.length;i++){
    const flag=args[i];
    if(flag==="--help")return {help:true};
    if(flag==="--dry-run"){o.dryRun=true;continue}
    if(!["--limit","--repeats","--delay-ms","--timeout-ms","--case","--out"].includes(flag))
      throw Error("Unknown option");
    const value=args[++i];
    if(!value||value.startsWith("--"))throw Error("Missing option value");
    if(flag==="--case")o.caseId=value;
    if(flag==="--out")o.out=value;
    if(flag==="--limit")o.limit=Number(value);
    if(flag==="--repeats")o.repeats=Number(value);
    if(flag==="--delay-ms")o.delayMs=Number(value);
    if(flag==="--timeout-ms")o.timeoutMs=Number(value);
  }
  if(!Number.isSafeInteger(o.limit)||o.limit<1||o.limit>40||
    !Number.isSafeInteger(o.repeats)||o.repeats<1||o.repeats>5||
    !Number.isSafeInteger(o.delayMs)||o.delayMs<500||o.delayMs>30000||
    !Number.isSafeInteger(o.timeoutMs)||o.timeoutMs<5000||o.timeoutMs>120000)
    throw Error("Invalid benchmark bounds");
  if(o.limit*o.repeats>50)throw Error("Too many quota-consuming public calls");
  return o;
}
export function validateFixture(f){
  if(f?.schemaVersion!==1||!Array.isArray(f.cases)||f.cases.length<1||
     !/^[a-f0-9]{64}$/i.test(f.source?.sha256??"")||
     !/^[0-9a-f-]{36}$/i.test(f.target?.agentId??""))
    throw Error("Golden fixture invalid");
  const seen=new Set();
  for(const t of f.cases){
    if(typeof t.id!=="string"||seen.has(t.id)||!Array.isArray(t.messages)||
       !t.messages.length||t.messages.some(s=>typeof s!=="string"||!s.trim()||s.length>650)||
       !Array.isArray(t.checks)||t.checks.some(c=>!c.key||!c.regex)||
       !Array.isArray(t.pages)||t.pages.some(n=>!Number.isSafeInteger(n)||n<1||n>197))
      throw Error("Invalid golden question");
    for(const c of t.checks)new RegExp(c.regex,"iu");
    seen.add(t.id);
  }
  return f;
}
async function getPublishedSession(agentId,timeoutMs){
  const response=await fetch(BASE+"/api/public/agents/"+encodeURIComponent(agentId)+"/config",{
    signal:AbortSignal.timeout(timeoutMs),cache:"no-store",
  });
  if(!response.ok)throw Error("Published config HTTP "+response.status);
  const config=await response.json();
  if(!config.sessionToken||!config.kb?.id)throw Error("No public session issued");
  return {token:config.sessionToken,kb:config.kb?.name,agent:config.agent?.name,
    kbId:config.kb?.id,versionNumber:config.published?.versionNumber};
}
async function queryPublished(test,session,timeoutMs){
  const start=performance.now();
  const messages=test.messages.length===2
    ? [{role:"user",content:test.messages[0]},
       {role:"assistant",content:"We are discussing control DO.4.2 (Disaster Recovery) in the NDMO policy."},
       {role:"user",content:test.messages[1]}]
    : test.messages.map(content=>({role:"user",content}));
  const response=await fetch(BASE+"/api/public/chat",{
    method:"POST",headers:{authorization:"Bearer "+session.token,"content-type":"application/json"},
    body:JSON.stringify({messages}),signal:AbortSignal.timeout(timeoutMs),
  });
  const headersMs=Math.round(performance.now()-start);
  const body=await response.text();
  const totalMs=Math.round(performance.now()-start);
  if(!response.ok)return {httpStatus:response.status,headersMs,totalMs,error:"HTTP "+response.status};
  const stream=parseStream(body);
  return {httpStatus:response.status,headersMs,totalMs,...stream};
}
async function main(argv){
  const opts=parseArgs(argv);
  if(opts.help){
    console.log("Usage: node scripts/rag-public-conversation-benchmark.mjs [--dry-run] [--limit 12] [--case id] [--repeats 1] [--delay-ms 850] [--out /tmp/report.json]");
    return;
  }
  const fixture=validateFixture(JSON.parse(await readFile(FIXTURE,"utf8")));
  const selected=opts.caseId?fixture.cases.filter(c=>c.id===opts.caseId):fixture.cases.slice(0,opts.limit);
  if(selected.length===0)throw Error("Unknown golden case ID");
  console.log(JSON.stringify({event:"benchmark_plan",cases:selected.length,repeats:opts.repeats,
    sourceSha256:fixture.source.sha256,agent:fixture.target.agentId,dryRun:opts.dryRun}));
  if(opts.dryRun)return;
  const session=await getPublishedSession(fixture.target.agentId,opts.timeoutMs);
  // The published KB is a frozen snapshot, not the tenant draft.
  if(session.kb!==fixture.target.kbName)throw Error("Published KB changed; refusing benchmark");
  const results=[];
  for(const t of selected)for(let repetition=1;repetition<=opts.repeats;repetition++){
    const row={id:t.id,category:t.category,language:t.language,pages:t.pages,repetition};
    try{
      const response=await queryPublished(t,session,opts.timeoutMs);
      if(response.httpStatus!==200){
        Object.assign(row,{httpStatus:response.httpStatus,errorCode:response.error,pass:false,
          headersMs:response.headersMs,totalMs:response.totalMs});
      }else{
        const score=scoreCase(t,response.answer,response.sources,response);
        Object.assign(row,{httpStatus:response.httpStatus,headersMs:response.headersMs,
          totalMs:response.totalMs,streamDone:response.done,streamErrors:response.errors,
          tokens:response.tokenEvents,pass:score.success,score,
          // Retained in a local mode-0600 report for human error analysis.
          answer:response.answer,
          sourceMetadata:response.sources.map(s=>({
            title:s?.title??null,originalFilename:s?.originalFilename??null,
            pageNumber:Number.isInteger(s?.pageNumber)?s.pageNumber:null,
          }))});
      }
    }catch(error){Object.assign(row,{pass:false,errorCode:error?.name==="TimeoutError"?"TIMEOUT":"REQUEST_FAILED"})}
    results.push(row);
    console.log(JSON.stringify({event:"case",id:row.id,repetition,
      pass:row.pass,coverage:row.score?.conceptRecall??null,refused:row.score?.refused??null,
      citationsInRange:row.score?.citationsInRange??false,sourcePageCount:row.score?.sourcePageMetadataCount??0,
      http:row.httpStatus??null,totalMs:row.totalMs??null,error:row.errorCode??null}));
    if(results.length<selected.length*opts.repeats)
      await new Promise(resolve=>setTimeout(resolve,opts.delayMs));
  }
  const avg=(a)=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):null;
  const latency=results.map(r=>r.totalMs).filter(Number.isFinite).sort((a,b)=>a-b);
  const pass=results.filter(r=>r.pass).length;
  const summary={
    total:results.length,pass,fail:results.length-pass,passRate:pass/results.length,
    answered:results.filter(r=>r.score?.expected==="answer").length,
    answeredPassed:results.filter(r=>r.score?.expected==="answer"&&r.pass).length,
    abstainPassed:results.filter(r=>r.score?.expected==="abstain"&&r.pass).length,
    expectedAbstain:results.filter(r=>r.score?.expected==="abstain").length,
    p50Ms:latency[Math.floor((latency.length-1)/2)]??null,
    p95Ms:latency[Math.floor(.95*(latency.length-1))]??null,
    avgMs:avg(latency),
    citationsInRange:results.filter(r=>r.score?.citationsInRange).length,
    sourcePageMetadataPresent:results.filter(r=>r.score?.sourcePageMetadataCount>0).length,
  };
  const report={kind:"ndmo-public-conversation-benchmark",executedAt:new Date().toISOString(),
    source:fixture.source,target:{agent:session.agent,kb:session.kb,kbId:session.kbId,
      publishedVersion:session.versionNumber},summary,results,
    qualification:"Non-authenticated published snapshot; lexical concept checks only; human citation/answer review required before release."};
  if(opts.out){
    await writeFile(resolve(opts.out),JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
    console.log(JSON.stringify({event:"report_saved",out:opts.out}));
  }
  console.log(JSON.stringify({event:"summary",...summary}));
  if(summary.fail)process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch(error=>{
    console.error("Public benchmark aborted: "+String(error?.message??"error").slice(0,150));
    process.exitCode=1;
  });

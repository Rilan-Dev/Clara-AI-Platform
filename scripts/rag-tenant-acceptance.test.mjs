import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  MARKERS, parseArgs, runTenantAcceptance, scoreEvidence, scoreNdjson,
} from "./rag-tenant-acceptance.mjs";

const ID="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const opts={baseUrl:"https://clara.ai.amazetechclans.com",kbId:ID,scope:"draft",topK:12,execute:false};
function provider({
  stageName="RAG-STAGING-DO42-Disposable",documentReady=true,authStatus=200,
  kbStatus=200,ragStatus=200,includePages=true,includeEvidence=true,
}={}){
  const requests=[];
  const fetcher=async (uri,init)=>{
    const path=new URL(uri).pathname;
    requests.push({path,method:init.method,authorization:init.headers?.Authorization});
    if(path==="/api/auth/me")return Response.json(authStatus===200?{user:{id:"hidden-user"}}:{error:"bad"}, {status:authStatus});
    if(path==="/api/kbs/"+ID)return Response.json({id:ID,name:stageName,status:"active"},{status:kbStatus});
    if(path==="/api/kbs/"+ID+"/documents")return Response.json([{
      id:"doc",status:documentReady?"ready":"processing",originalFilename:"PoliciesEn001.pdf",
    }]);
    if(path==="/api/rag/search"){
      const sources=includeEvidence ? [
        {snippet:MARKERS.slice(0,5).join(". "),pageNumber:includePages?60:null},
        {snippet:MARKERS.slice(5).join(". "),pageNumber:includePages?61:null},
      ]:[{snippet:"DO.4.2 Disaster Recovery",pageNumber:60}];
      return Response.json({grounded:true,sources},{status:ragStatus});
    }
    if(path==="/api/chat"){
      return new Response([
        JSON.stringify({type:"sources",payload:[{id:"private"}]}),
        JSON.stringify({type:"token",payload:MARKERS.join(". ")+" [S1] [S2]"}),
        JSON.stringify({type:"done"}),
      ].join("\n")+"\n", {headers:{"content-type":"application/x-ndjson"}});
    }
    throw Error("Unknown request");
  };
  return {fetcher,requests};
}

test("parseArgs enforces tenant KB ID and secure origin without accepting CLI credentials",()=>{
  assert.equal(parseArgs(["--kb-id",ID]).execute,false);
  assert.equal(parseArgs(["--kb-id",ID,"--execute"]).execute,true);
  assert.equal(parseArgs(["--kb-id",ID,"--base-url","http://127.0.0.1:4000"]).baseUrl,"http://127.0.0.1:4000");
  for(const argv of [
    ["--kb-id",ID,"--token","secret"],
    ["--kb-id",ID,"--base-url","http://example.com"],
    ["--kb-id",ID,"--base-url","https://example.com/stage"],
    ["--kb-id",ID,"--base-url","https://attacker.example"],
    ["--kb-id",ID,"--base-url","https://clara.ai.amazetechclans.com:444"],
    ["--kb-id","bad"],
    ["--kb-id",ID,"--top-k","2"],
  ])assert.throws(()=>parseArgs(argv));
});

test("read-only preflight checks identity, tenant KB and source readiness with no quota calls", async()=>{
  const {fetcher,requests}=provider();
  const out=await runTenantAcceptance(opts,"test-session",fetcher);
  assert.equal(out.tenantAuthPassed,true);
  assert.equal(out.stagingKbVerified,true);
  assert.equal(out.documentReady,true);
  assert.equal(out.uploadedRevisionVerified,false);
  assert.equal(out.releaseApproved,false);
  assert.equal(out.manualReviewRequired,true);
  assert.deepEqual(requests.map(x=>x.method),["GET","GET","GET"]);
  assert.equal(requests.some(x=>x.path==="/api/rag/search"),false);
  assert.ok(requests.every(x=>x.authorization==="Bearer test-session"));
});

test("rejects denied identity or tenant authorization before reading documents",async()=>{
  for(const which of [{authStatus:401},{kbStatus:403}]){
    const {fetcher,requests}=provider(which);
    await assert.rejects(runTenantAcceptance(opts,"fake",fetcher));
    assert.equal(requests.some(x=>x.path==="/api/rag/search"),false);
  }
});

test("rejects non-disposable KB name and incomplete document ingestion",async()=>{
  for(const which of [{stageName:"Production Customer KB"},{documentReady:false}]){
    const {fetcher,requests}=provider(which);
    await assert.rejects(runTenantAcceptance({...opts,execute:true},"fake",fetcher));
    assert.equal(requests.some(x=>x.path==="/api/rag/search"),false);
    assert.equal(requests.some(x=>x.path==="/api/chat"),false);
  }
});

test("complete tenant RAG evidence permits chat request but never approves release",async()=>{
  const {fetcher,requests}=provider();
  const out=await runTenantAcceptance({...opts,execute:true},"fake",fetcher);
  assert.equal(out.retrieval.grounded,true);
  assert.equal(out.retrieval.covered,7);
  assert.equal(out.retrieval.expectedPagesCovered,2);
  assert.equal(out.retrieval.pagesPresent,true);
  assert.equal(out.chat.done,true);
  assert.equal(out.chat.errors,0);
  assert.equal(out.chat.markerMatches,7);
  assert.equal(out.chat.citationTagCount,2);
  assert.equal(out.releaseApproved,false);
  assert.equal(out.uploadedRevisionVerified,false);
  assert.deepEqual(requests.slice(-2).map(x=>x.path),["/api/rag/search","/api/chat"]);
  assert.doesNotMatch(JSON.stringify(out),/test-session|private|PoliciesEn001\.pdf/);
});

test("page-only retrieval cannot claim complete evidence or trigger paid LLM chat",async()=>{
  for(const change of [{includePages:false},{includeEvidence:false}]){
    const {fetcher,requests}=provider(change);
    const out=await runTenantAcceptance({...opts,execute:true},"fake",fetcher);
    assert.equal(out.releaseApproved,false);
    assert.equal(out.chat,null);
    assert.equal(requests.filter(x=>x.path==="/api/chat").length,0);
  }
});

test("malformed chat events fail and no raw answer content enters evidence score",()=>{
  assert.throws(()=>scoreNdjson("untrusted nonjson"));
  const raw=MARKERS.join(". ")+" [S1]";
  const out=scoreNdjson(JSON.stringify({type:"token",payload:raw})+"\n"+
    JSON.stringify({type:"done"})+"\n");
  assert.equal(out.markerMatches,7);
  assert.equal(out.done,true);
  assert.doesNotMatch(JSON.stringify(out),/prioritized list|recovery point objectives/);
});

test("evidence score counts exact source clause text and both page citations",()=>{
  const result=scoreEvidence([{snippet:MARKERS.slice(0,3).join(". "),pageNumber:60},
    {snippet:MARKERS.slice(3).join(". "),pageNumber:61}]);
  assert.equal(result.covered,7);
  assert.equal(result.withPage,2);
  assert.equal(result.expectedPagesCovered,2);
});


test("does not fabricate evidence by joining the end of one excerpt to the next",()=>{
  const excerpts=[{snippet:"prioritized list of",pageNumber:60},
    {snippet:"information systems",pageNumber:60}];
  assert.equal(scoreEvidence(excerpts).covered,0);
});

test("CLI missing session in non-interactive context fails without making requests",()=>{
  const env={...process.env};
  delete env.CLARA_DEBUG_TOKEN;
  const p=spawnSync(process.execPath,["scripts/rag-tenant-acceptance.mjs","--kb-id",ID],
    {env,encoding:"utf8",timeout:10000});
  assert.equal(p.status,1);
  assert.doesNotMatch(p.stdout+p.stderr,/test-session|Authorization:|PRIVATE/);
});

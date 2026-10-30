import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {parseArgs,runSetup,validateWorkerStage,validateIngestConsumers} from "./rag-staging-setup.mjs";

const AGENT="11111111-2222-4333-8444-555555555555";
const ORG="22222222-3333-4444-8555-666666666666";
const STAGE="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const source="/private/PoliciesEn001.pdf";
const payload=Buffer.from("%PDF-1.7\n"+"A".repeat(1500));
const create={action:"create",agentId:AGENT};
const upload={action:"upload",kbId:STAGE,source};
const status={action:"status",kbId:STAGE};
function service({superAdmin=false,stageName="RAG-STAGING-DO42-Test",
  existingDocs=[],deny=false}={}){
  const calls=[];
  async function fetcher(url,opts){
    const u=new URL(url);
    const path=u.pathname;
    calls.push({path,method:opts.method,hasToken:opts.headers?.Authorization==="Bearer fake-session",body:opts.body});
    if(deny)return Response.json({error:"denied"},{status:403});
    if(path==="/api/auth/me")return Response.json({user:{id:"member",isSuperAdmin:superAdmin}});
    if(path==="/api/orgs")return Response.json([{id:ORG,name:"Private tenant"}]);
    if(path==="/api/orgs/"+ORG+"/agents")return Response.json([{id:AGENT,name:"Staging agent"}]);
    if(path==="/api/agents/"+AGENT)return Response.json({id:AGENT});
    if(path==="/api/agents/"+AGENT+"/kbs")return Response.json({id:STAGE,name:JSON.parse(opts.body).name},{status:201});
    if(path==="/api/kbs/"+STAGE)return Response.json({id:STAGE,name:stageName,status:"active"});
    if(path==="/api/kbs/"+STAGE+"/documents"&&opts.method==="GET")
      return Response.json(existingDocs);
    if(path==="/api/kbs/"+STAGE+"/documents"&&opts.method==="POST")
      return Response.json({queued:[{id:"document",jobId:"job"}],errors:[]},{status:202});
    return Response.json({error:"not found"},{status:404});
  }
  return {fetcher,calls};
}
function localFiles(){
  return {
    checkWorker:async ()=>true,
    statSource:async()=>({size:payload.length,isFile:()=>true}),
    readSource:async()=>payload,
  };
}

test("only accepts explicit create/upload/status actions with valid UUIDs",()=>{
  assert.deepEqual(parseArgs(["--action","list"]),{action:"list"});
  assert.deepEqual(parseArgs(["--action","create","--agent-id",AGENT]),create);
  assert.deepEqual(parseArgs(["--action","upload","--kb-id",STAGE,"--source",source]),upload);
  assert.deepEqual(parseArgs(["--action","status","--kb-id",STAGE]),status);
  for(const a of [
    ["--action","list","--agent-id",AGENT],
    ["--action","create"],["--action","create","--agent-id","bad"],
    ["--action","create","--agent-id",AGENT,"--source",source],
    ["--action","upload","--kb-id",STAGE],
    ["--action","status","--kb-id",STAGE,"--source",source],
    ["--action","status","--kb-id",STAGE,"--token","unsafe"],
  ])assert.throws(()=>parseArgs(a));
});

test("lists tenant-visible agent choices without creating or uploading anything",async()=>{
  const s=service();
  const out=await runSetup({action:"list"},"fake-session",{fetcher:s.fetcher});
  assert.deepEqual(out.options,[{orgId:ORG,orgName:"Private tenant",
    agentId:AGENT,agentName:"Staging agent"}]);
  assert.equal(out.productionKbTouched,false);
  assert.ok(s.calls.every(x=>x.method==="GET"));
  assert.ok(s.calls.every(x=>x.hasToken));
});

test("creates a disposable KB through normal authorized agent endpoint",async()=>{
  const s=service();
  const d=await runSetup(create,"fake-session",{fetcher:s.fetcher,
    createId:()=>"12345678-0000-4000-8000-000000000000",
    now:()=>new Date("2026-10-30T00:00:00Z")});
  assert.equal(d.kbId,STAGE);
  assert.equal(d.stagingName,"RAG-STAGING-DO42-2026-10-30-12345678");
  assert.equal(d.releaseApproved,false);
  assert.equal(d.productionKbTouched,false);
  assert.deepEqual(s.calls.map(x=>x.method),["GET","GET","POST"]);
  assert.ok(s.calls.every(x=>x.hasToken));
  assert.equal(JSON.parse(s.calls[2].body).name,d.stagingName);
  assert.doesNotMatch(JSON.stringify(d),/fake-session/);
});

test("tenant denial or platform administrator never creates a KB",async()=>{
  for(const scenario of [{superAdmin:true},{deny:true}]){
    const s=service(scenario);
    await assert.rejects(runSetup(create,"fake-session",{fetcher:s.fetcher}));
    assert.equal(s.calls.some(x=>x.method==="POST"),false);
  }
});

test("reports the current staging document state without disclosing document metadata",async()=>{
  const s=service({existingDocs:[{status:"ready",originalFilename:"secret.pdf"},
    {status:"failed",errorMessage:"secret"}]});
  const r=await runSetup(status,"fake-session",{fetcher:s.fetcher});
  assert.deepEqual({documents:r.documents,ready:r.ready,failed:r.failed,pending:r.pending},
    {documents:2,ready:1,failed:1,pending:0});
  assert.doesNotMatch(JSON.stringify(r),/secret/);
  assert.ok(s.calls.every(x=>x.method==="GET"));
});

test("uploads one original PDF only after verifying exact worker settings",async()=>{
  const s=service();
  let checked=0;
  const r=await runSetup(upload,"fake-session",{
    fetcher:s.fetcher,...localFiles(),
    checkWorker:async kbId=>{assert.equal(kbId,STAGE);checked++;return true},
  });
  assert.equal(r.uploaded,true);
  assert.equal(r.uploadedDigestVerified,false);
  assert.match(r.localSourceSha256,/^[a-f0-9]{64}$/);
  assert.equal(checked,1);
  assert.equal(s.calls.filter(x=>x.method==="POST").length,1);
  assert.equal(s.calls.at(-1).body instanceof FormData,true);
  assert.equal(s.calls.at(-1).body.get("file").name,"PoliciesEn001.pdf");
});

test("refuses upload to a non-staging or existing-document KB, before file/network writes",async()=>{
  for(const scenario of [
    {stageName:"Customer Production KB"},{existingDocs:[{status:"ready"}]}
  ]){
    const s=service(scenario);
    let checks=0;
    await assert.rejects(runSetup(upload,"fake-session",{
      fetcher:s.fetcher,...localFiles(),checkWorker:()=>{checks++;return true},
    }));
    assert.equal(checks,0);
    assert.equal(s.calls.some(x=>x.method==="POST"),false);
  }
});

test("refuses upload if no exact staged worker override is active",async()=>{
  const s=service();let sourceRead=false;
  await assert.rejects(runSetup(upload,"fake-session",{
    fetcher:s.fetcher,checkWorker:()=>{throw Error("Worker not exclusively configured for this staging KB")},
    readSource:()=>{sourceRead=true;return payload},
  }));
  assert.equal(sourceRead,false);
  assert.equal(s.calls.some(x=>x.method==="POST"),false);
});

test("a worker probe returning false cannot authorize a document upload",async()=>{
  const serviceMock=service();
  await assert.rejects(runSetup(upload,"fake-session",{
    ...localFiles(),fetcher:serviceMock.fetcher,checkWorker:async()=>false,
  }));
  assert.equal(serviceMock.calls.some(x=>x.method==="POST"),false);
});

test("worker verification forbids production global flags and unrelated stage ids",()=>{
  const good={stageEnabled:true,stageId:STAGE,globalPage:false,globalSection:false};
  assert.equal(validateWorkerStage(good,STAGE),true);
  for(const bad of [
    {...good,stageEnabled:false},{...good,stageId:AGENT},
    {...good,globalPage:true},{...good,globalSection:true},{...good,stageId:""},
  ])assert.throws(()=>validateWorkerStage(bad,STAGE));
  assert.throws(()=>validateWorkerStage("not json",STAGE));
});

test("requires BOTH backend and worker to have the same exact staging override",()=>{
  const good={stageEnabled:true,stageId:STAGE,globalPage:false,globalSection:false};
  const bad={...good,stageEnabled:false};
  assert.equal(validateIngestConsumers([JSON.stringify(good),JSON.stringify(good)],STAGE),true);
  for(const readings of [[good],[good,bad],[bad,good],
     [good,{...good,stageId:AGENT}],[good,{...good,globalPage:true}]]){
    assert.throws(()=>validateIngestConsumers(readings,STAGE));
  }
});

test("rejects a fabricated PDF or unapproved filename",async()=>{
  const s=service();
  await assert.rejects(runSetup({...upload,source:"/private/renamed.pdf"},"fake-session",
    {fetcher:s.fetcher,...localFiles()}));
  await assert.rejects(runSetup(upload,"fake-session",{
    fetcher:s.fetcher,...localFiles(),readSource:async()=>Buffer.from("WRONG".repeat(350))
  }));
  assert.equal(s.calls.some(x=>x.method==="POST"),false);
});

test("CLI refuses unattended execution without a session and reveals no tokens",()=>{
  const env={...process.env};
  delete env.CLARA_DEBUG_TOKEN;
  const p=spawnSync(process.execPath,["scripts/rag-staging-setup.mjs",
    "--action","status","--kb-id",STAGE],{env,encoding:"utf8",timeout:10000});
  assert.equal(p.status,1);
  assert.doesNotMatch(p.stdout+p.stderr,/fake-session|Authorization|password/i);
});

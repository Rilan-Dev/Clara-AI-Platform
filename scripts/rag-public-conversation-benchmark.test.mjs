import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseArgs,normalizeText,parseStream,scoreCase,validateFixture} from "./rag-public-conversation-benchmark.mjs";

const fixture=JSON.parse(readFileSync(new URL("./fixtures/ndmo-ar-v15-public-chat-benchmark.json",import.meta.url)));
function byId(id){return fixture.cases.find(c=>c.id===id)}
function score(id,answer,sources=[{title:"SDAIA NDMO Policies Ar 001",pageNumber:69}]){
  return scoreCase(byId(id),answer,sources,{done:true,errors:0});
}
const full="Prioritized list of information systems for recovery. Assign roles for incident response. "+
  "Activate response to incidents. Reduce damage to critical operations. "+
  "Define Recovery Point Objectives (RPO). Define Recovery Time Objectives (RTO). "+
  "Define recovery activities. [S1]";
const fullArabic="قائمة مرتبة حسب الأولوية بأنظمة المعلومات، تخصيص الأدوار المسؤولة عن الاستجابة للحوادث، "+
  "إجراءات لتفعيل الاستجابة للحوادث، تحديد إجراءات لتقليل الأضرار، أهداف نقطة التعافي، "+
  "أهداف زمن التعافي، تحديد أنشطة التعافي [S1]";

test("all 18 golden questions ground in a pinned original PDF hash and page range",()=>{
  assert.equal(validateFixture(fixture),fixture);
  assert.equal(fixture.cases.length,18);
  assert.equal(fixture.source.sha256.length,64);
  assert.equal(fixture.cases.filter(c=>c.expect==="abstain").length,3);
  assert.ok(fixture.cases.every(c=>c.pages.every(n=>n<=197)));
});

test("the English DO.4.2 answer needs all seven distinct concepts",()=>{
  const result=score("do42-en-seven",full);
  assert.equal(result.success,true);
  assert.equal(result.conceptRecall,1);
  assert.equal(result.citationsInRange,true);
  assert.deepEqual(result.expectedPages,[69,70]);
});
test("missing one requirement fails while 6 of 7 concepts remain",()=>{
  const result=score("do42-en-seven",full.replace("Define recovery activities.",""));
  assert.equal(result.success,false);
  assert.equal(result.conceptsFound,6);
});
test("Arabic diacritics and hamza normalization support policy wording",()=>{
  const result=score("do42-ar-seven",fullArabic);
  assert.equal(result.conceptRecall,1);
  assert.equal(result.arabicAnswer,true);
  assert.equal(result.success,true);
  assert.equal(normalizeText("إِسْتِجَابة  الْكَوَارِث"),"استجابه الكوارث");
});
test("irrelevant generic agent fallback fails the grounded QA requirement",()=>{
  const s=score("do42-en-seven","Hello! I don't have enough information in the knowledge base to answer.");
  assert.equal(s.success,false);
  assert.equal(s.conceptRecall,0);
  assert.equal(s.refused,true);
});
test("out-of-scope exact amounts should be refused rather than invented",()=>{
  assert.equal(score("do42-external-penalty","The source does not specify an exact fine for DO.4.2.").success,true);
  assert.equal(score("do42-external-penalty","The fine is 250,000 SAR.").success,false);
});
test("normal answers with qualifications should not be classified as blanket refusals",()=>{
  const s=score("do42-en-seven",full+" This is not an exhaustive list.");
  assert.equal(s.success,true);
});
test("citations must refer to actual emitted source indices, but missing metadata is reported separately",()=>{
  const missing=score("do42-en-seven",full.replace("[S1]","[S9]"),[{title:"NDMO",pageNumber:null}]);
  assert.equal(missing.citationsInRange,false);
  assert.equal(missing.sourcePageMetadataCount,0);
  assert.equal(missing.success,true); // concept pass is distinct from citation quality
});
test("malformed NDJSON is rejected and stream errors remain observable",()=>{
  assert.throws(()=>parseStream("not-json\n"));
  const good=[{type:"sources",payload:[{title:"NDMO"}]},{type:"token",payload:"hello [S1]"},
    {type:"error",payload:"provider unavailable"},{type:"done"}];
  const parsed=parseStream(good.map(x=>JSON.stringify(x)).join("\n")+"\n");
  assert.equal(parsed.answer,"hello [S1]");
  assert.equal(parsed.sources.length,1);
  assert.equal(parsed.errors,1);
  assert.equal(parsed.done,true);
});
test("argument validation bounds expensive public LLM calls",()=>{
  assert.equal(parseArgs([]).limit,12);
  assert.equal(parseArgs(["--case","do42-en-seven","--repeats","3"]).repeats,3);
  for(const argv of [["--limit","100"],["--repeats","6"],["--limit","30","--repeats","2"],
    ["--delay-ms","0"],["--timeout-ms","0"],["--token","private"]])
    assert.throws(()=>parseArgs(argv));
});

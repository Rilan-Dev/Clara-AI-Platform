import test from "node:test";
import assert from "node:assert/strict";
import { dcgAtK, ndcgAtK, compareLabeledRuns } from "./evaluate-rag-evidence.mjs";

const config = { kbId: "kb-example", topK: 3, scope: "draft", channel: "chat" };
const off = { kind: "run", config, perQuestion: [
  { question: "Recovery roles", failures: 0, sources: [{id:"relevant"},{id:"noise"},{id:"partial"}] },
] };
const on = { kind: "run", config, perQuestion: [
  { question: "Recovery roles", failures: 0, sources: [{id:"noise"},{id:"partial"},{id:"relevant"}] },
] };
const labels = {version:1,cases:[{questionIndex:1,sourceGrades:{relevant:3,partial:1,noise:0}}]};

test("nDCG rewards directly supporting evidence rather than arbitrary top-1 source changes", () => {
  assert.equal(ndcgAtK(["relevant", "partial", "noise"], labels.cases[0].sourceGrades), 1);
  assert.ok(ndcgAtK(["noise", "partial", "relevant"], labels.cases[0].sourceGrades)<1);
  assert.equal(dcgAtK(["noise"], labels.cases[0].sourceGrades),0);
});

test("flags a relevance regression without disclosing private question or source identifiers", () => {
  const result=compareLabeledRuns(off,on,labels);
  assert.equal(result.regressed,1);
  assert.equal(result.improved,0);
  assert.ok(result.meanNdcg3Delta<0);
  const rendered=JSON.stringify(result);
  assert.ok(!rendered.includes("Recovery roles"));
  assert.ok(!rendered.includes("relevant"));
});

test("rejects invalid grades, mismatched KB configs and unidentified labels", () => {
  assert.throws(() => compareLabeledRuns(off, {...on,config:{...config,scope:"live"}},labels),/incompatible/);
  assert.throws(() => compareLabeledRuns(off,on,{version:1,cases:[{questionIndex:1,sourceGrades:{"unseen":3}}]}),/unseen source/);
  assert.throws(() => compareLabeledRuns(off,on,{version:1,cases:[{questionIndex:1,sourceGrades:{"relevant":4}}]}),/0\.\.3/);
  assert.throws(() => compareLabeledRuns(off,on,{version:1,cases:[{questionIndex:2,sourceGrades:{"relevant":3}}]}),/missing/);
});

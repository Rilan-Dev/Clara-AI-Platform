import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCitationIntegrity } from "./rag-citation-integrity.mjs";

function fixture() {
  return {
    kind: "run",
    config: { kbId: "PRIVATE_TENANT_KB_ID" },
    aggregate: { measuredRequests: 2, successfulRequests: 2, failedRequests: 0 },
    attempts: [{ questionIndex: 1 }, { questionIndex: 2 }],
    perQuestion: [
      { question: "PRIVATE QUESTION A", grounded: true, failures: 0,
        sources: [{ id: "PRIVATE SOURCE A", documentId: "PRIVATE DOC", pageNumber: 3 }] },
      { question: "PRIVATE QUESTION B", grounded: true, failures: 0,
        sources: [{ id: "PRIVATE SOURCE B", documentId: "PRIVATE DOC", pageNumber: 4 }] },
    ],
  };
}
test("complete source and page metadata is ready only for further human review", () => {
  const result = evaluateCitationIntegrity(fixture());
  assert.equal(result.readyForHumanPageReview, true);
  assert.equal(result.citationCorrectnessReviewed, false);
  assert.equal(result.pageMetadataReady, true);
  assert.equal(result.questionsWithPageEvidence, 2);
  assert.equal(result.totalCitations, 2);
  assert.equal(result.citationsWithPage, 2);
});

test("missing page metadata fails closed and counts each affected question", () => {
  const run = fixture();
  run.perQuestion[0].sources[0].pageNumber = null;
  run.perQuestion[1].sources[0].pageNumber = 0;
  const result = evaluateCitationIntegrity(run);
  assert.equal(result.readyForHumanPageReview, false);
  assert.equal(result.citationsWithoutPage, 2);
  assert.equal(result.questionsWithoutPageEvidence, 2);
  assert.equal(result.gates.allSourcePagesPresent, false);
});

test("missing source ids, document links and ungrounded retrieval block release", () => {
  const run = fixture();
  run.perQuestion[0].grounded = false;
  run.perQuestion[0].sources[0].id = "";
  run.perQuestion[1].sources[0].documentId = "";
  const result = evaluateCitationIntegrity(run);
  assert.equal(result.gates.allQuestionsGrounded, false);
  assert.equal(result.gates.allSourceIdsPresent, false);
  assert.equal(result.gates.allDocumentIdsPresent, false);
  assert.equal(result.readyForHumanPageReview, false);
});

test("does not disclose any secret question, source or tenant id in aggregate output", () => {
  const data = JSON.stringify(evaluateCitationIntegrity(fixture()));
  assert.doesNotMatch(data, /PRIVATE|QUESTION|SOURCE|DOC|TENANT/);
  assert.match(data, /"citationCorrectnessReviewed":false/);
  assert.match(data, /"noApiCalls":true/);
});

test("rejects an incomplete or fabricated successful benchmark envelope", () => {
  const run = fixture();
  run.aggregate.measuredRequests = 4;
  assert.throws(() => evaluateCitationIntegrity(run), /Inconsistent/);
  assert.throws(() => evaluateCitationIntegrity({ kind: "run", perQuestion: [] }), /complete/);
  assert.throws(() => evaluateCitationIntegrity({}), /complete/);
});

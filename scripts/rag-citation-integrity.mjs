#!/usr/bin/env node
/**
 * Citation/page integrity preflight for an EXISTING private RAG benchmark run.
 * Offline, read-only, aggregate-only. Never prints questions, source IDs, names,
 * tokens, snippets, document IDs or file paths.
 *
 * Usage:
 *   node scripts/rag-citation-integrity.mjs --run PRIVATE_BENCHMARK_RUN.json
 *
 * Page metadata is necessary but NOT sufficient to prove correct citations.
 * Human review of original pages and answer relevance remains mandatory.
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function usablePage(n) {
  return Number.isSafeInteger(n) && n > 0;
}

export function evaluateCitationIntegrity(run) {
  if (run?.kind !== "run" || !Array.isArray(run.perQuestion) || !run.perQuestion.length ||
      !Array.isArray(run.attempts) || !run.attempts.length ||
      !run.config || typeof run.config.kbId !== "string" || !run.config.kbId.trim()) {
    throw new Error("Not a complete RAG benchmark run");
  }
  if (!Number.isInteger(run.aggregate?.measuredRequests) ||
      !Number.isInteger(run.aggregate?.successfulRequests) ||
      !Number.isInteger(run.aggregate?.failedRequests) ||
      run.aggregate.measuredRequests !== run.attempts.length ||
      run.aggregate.successfulRequests + run.aggregate.failedRequests !== run.attempts.length) {
    throw new Error("Inconsistent measured request totals");
  }
  let citationCount = 0, pageCount = 0, missingDoc = 0, invalidSource = 0;
  let withPage = 0, noPage = 0, noSources = 0, failedQuestions = 0, groundedQuestions = 0;
  for (const q of run.perQuestion) {
    if (!Array.isArray(q?.sources) || typeof q?.question !== "string" || !q.question ||
        typeof q?.grounded !== "boolean" || !Number.isInteger(q?.failures)) {
      throw new Error("Malformed question summary");
    }
    if (q.failures > 0) failedQuestions++;
    if (q.grounded) groundedQuestions++;
    if (!q.sources.length) noSources++;
    let hasPage = false;
    for (const source of q.sources) {
      if (!source || typeof source !== "object" ||
          typeof source.id !== "string" || !source.id) {
        invalidSource++;
        continue;
      }
      citationCount++;
      if (!source.documentId || typeof source.documentId !== "string") missingDoc++;
      if (usablePage(source.pageNumber)) {
        pageCount++;
        hasPage = true;
      }
    }
    if (hasPage) withPage++;
    else noPage++;
  }
  const allRequestsSucceeded = run.aggregate.failedRequests === 0 &&
    run.aggregate.successfulRequests === run.aggregate.measuredRequests;
  const gates = {
    allMeasuredRequestsSucceeded: allRequestsSucceeded,
    allQuestionsGrounded: groundedQuestions === run.perQuestion.length &&
      failedQuestions === 0 && noSources === 0,
    allSourceIdsPresent: invalidSource === 0,
    allDocumentIdsPresent: missingDoc === 0,
    allSourcePagesPresent: pageCount === citationCount && citationCount > 0,
  };
  return {
    kind: "offline-rag-citation-integrity",
    formatVersion: 1,
    noApiCalls: true,
    citationCorrectnessReviewed: false,
    questions: run.perQuestion.length,
    questionsWithPageEvidence: withPage,
    questionsWithoutPageEvidence: noPage,
    groundedQuestions,
    questionsWithFailures: failedQuestions,
    measuredRequests: run.aggregate.measuredRequests,
    successfulRequests: run.aggregate.successfulRequests,
    totalCitations: citationCount,
    citationsWithPage: pageCount,
    citationsWithoutPage: citationCount - pageCount,
    citationsWithoutDocument: missingDoc,
    invalidSources: invalidSource,
    gates,
    pageMetadataReady: gates.allSourcePagesPresent,
    readyForHumanPageReview: Object.values(gates).every(Boolean),
    qualification: "Page numbers demonstrate metadata presence only. Original-page verification, requirement completeness, language coverage and tenant-authorized staging retrieval are separate release gates.",
  };
}

async function main(argv) {
  if (argv.length !== 2 || argv[0] !== "--run" || !argv[1] || argv[1].startsWith("--"))
    throw new Error("Usage: node scripts/rag-citation-integrity.mjs --run PRIVATE_RUN.json");
  let content;
  try { content = await readFile(argv[1], "utf8"); }
  catch { throw new Error("Cannot read benchmark file"); }
  let run;
  try { run = JSON.parse(content); }
  catch { throw new Error("Invalid benchmark JSON"); }
  const result = evaluateCitationIntegrity(run);
  console.log(JSON.stringify(result, null, 2));
  if (!result.readyForHumanPageReview) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message.startsWith("Usage:") ? error.message :
      "Citation integrity evaluation failed: invalid or incomplete private benchmark");
    process.exitCode = 1;
  });
}

#!/usr/bin/env node
/**
 * Offline, reviewer-labeled relevance gate over EXISTING private RAG A/B files.
 * No HTTP, LLM, embeddings or Qdrant calls. Prints only anonymized ranks/scores.
 *
 * Labels are local operator evidence judgments, NEVER committed into a repo:
 * { "version": 1, "cases": [
 *    { "questionIndex": 4, "sourceGrades": { "<existing-source-id>": 3 } }
 * ] }
 * Grades: 0 unsupported, 1 peripheral, 2 partially supporting, 3 directly
 * answering. Missing source ID is graded 0. These are subjective judgments:
 * preserve original source excerpts for independent adjudication.
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function dcgAtK(sourceIds, grades, k = 3) {
  let score = 0;
  for (let i = 0; i < Math.min(k, sourceIds.length); i++) {
    const relevance = grades[sourceIds[i]] ?? 0;
    score += (2 ** relevance - 1) / Math.log2(i + 2);
  }
  return score;
}

export function ndcgAtK(sourceIds, grades, k = 3) {
  const best = Object.values(grades).slice().sort((a, b) => b - a);
  const ideal = Array.from({ length: Math.min(k, best.length) }, (_, i) => String(i));
  const idealGrades = Object.fromEntries(ideal.map((id, i) => [id, best[i]]));
  const denominator = dcgAtK(ideal, idealGrades, k);
  return denominator > 0 ? dcgAtK(sourceIds, grades, k) / denominator : 0;
}

function validateLabels(labels) {
  if (labels?.version !== 1 || !Array.isArray(labels.cases) || labels.cases.length === 0) {
    throw new Error("Labels require version=1 and a nonempty cases array");
  }
  const seen = new Set();
  for (const c of labels.cases) {
    if (!Number.isInteger(c?.questionIndex) || c.questionIndex < 1 ||
        !c.sourceGrades || typeof c.sourceGrades !== "object" ||
        Array.isArray(c.sourceGrades)) throw new Error("Invalid relevance case");
    if (seen.has(c.questionIndex)) throw new Error("Duplicate questionIndex");
    seen.add(c.questionIndex);
    const grades = Object.values(c.sourceGrades);
    if (!grades.length || !grades.some((grade) => grade >= 2) ||
      grades.some((grade) => !Number.isInteger(grade) || grade < 0 || grade > 3)) {
      throw new Error("Each case requires a 0..3 relevance grade and at least one supporting (2+) source");
    }
  }
}

export function compareLabeledRuns(baseline, candidate, labels) {
  validateLabels(labels);
  if (baseline?.kind !== "run" || candidate?.kind !== "run" ||
      !Array.isArray(baseline.perQuestion) || !Array.isArray(candidate.perQuestion)) {
    throw new Error("Input files must be RAG benchmark runs");
  }
  for (const key of ["kbId", "topK", "scope", "mode", "channel"]) {
    if ((baseline.config?.[key] ?? null) !== (candidate.config?.[key] ?? null)) {
      throw new Error("Baseline and candidate have incompatible configurations");
    }
  }
  const cases = labels.cases.map(({ questionIndex, sourceGrades }) => {
    const index = questionIndex - 1;
    const b = baseline.perQuestion[index], c = candidate.perQuestion[index];
    if (!b || !c || !b.question || b.question !== c.question ||
        b.failures || c.failures || !Array.isArray(b.sources) || !Array.isArray(c.sources)) {
      throw new Error("Labeled question missing, unmatched, or failed");
    }
    const baseIds = b.sources.map((s) => s.id);
    const candIds = c.sources.map((s) => s.id);
    const available = new Set([...baseIds, ...candIds]);
    if (Object.keys(sourceGrades).some((id) => !available.has(id))) {
      throw new Error("A reviewer label refers to an unseen source");
    }
    const base = ndcgAtK(baseIds, sourceGrades), on = ndcgAtK(candIds, sourceGrades);
    return {
      questionIndex,
      baselineNdcg3: Number(base.toFixed(4)),
      candidateNdcg3: Number(on.toFixed(4)),
      delta: Number((on - base).toFixed(4)),
      baselineTopGrade: sourceGrades[baseIds[0]] ?? 0,
      candidateTopGrade: sourceGrades[candIds[0]] ?? 0,
    };
  });
  const sum = cases.reduce((acc, c) => acc + c.delta, 0);
  return {
    mode: "offline-labeled-evidence-review",
    casesEvaluated: cases.length,
    improved: cases.filter((c) => c.delta > 0.0001).length,
    regressed: cases.filter((c) => c.delta < -0.0001).length,
    tied: cases.filter((c) => Math.abs(c.delta) <= 0.0001).length,
    meanNdcg3Delta: Number((sum / cases.length).toFixed(4)),
    cases,
    qualification: "Human-supplied relevance grades, not objective ground truth. No answer-generation validation or fresh retrieval was performed.",
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== "--baseline" ||
      args[2] !== "--candidate" || args[4] !== "--labels") {
    throw new Error("Usage: node scripts/evaluate-rag-evidence.mjs --baseline OFF.json --candidate ON.json --labels LOCAL_PRIVATE.json");
  }
  const [baseline, candidate, labels] = await Promise.all(
    [args[1], args[3], args[5]].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  );
  console.log(JSON.stringify(compareLabeledRuns(baseline, candidate, labels), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Evidence evaluator failed: " + error.message);
    process.exitCode = 1;
  });
}

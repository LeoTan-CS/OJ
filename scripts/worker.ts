import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildLeaderboardSnapshot } from "../src/lib/model-leaderboard";
import { modelRunPaths, modelRuntimeLimitMs } from "../src/lib/model-upload";
import { modelTimeoutMessage, readModelQuestionResults, readModelQuestions, runModelQuestionsIndividually, type ModelQuestionResult } from "../src/lib/model-runner";
import { createEmptyJudgeReport, judgeModelRanking, modelRankingPaths, modelRankingQuestionSourceLabel, type JudgeBatchReport, type JudgeQuestionReport, type RankingJudgeBatchInput, writeJudgeInput, writeLeaderboardSnapshot } from "../src/lib/model-ranking";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const pollMs = 1000;
const outputLimit = 4000;

function averageMetric(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!valid.length) return null;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function normalizeQuestionError(result: ModelQuestionResult) {
  return (result.error || (result.status === "TIME_LIMIT_EXCEEDED" ? modelTimeoutMessage : result.status)).slice(0, outputLimit);
}

type RankingRawResponse = {
  questionId: string;
  rawResponse: string | null;
};

type LoadedRankingBatch = NonNullable<Awaited<ReturnType<typeof loadRankingBatch>>>;
type LoadedRankingBatchResult = LoadedRankingBatch["results"][number];
type ParsedRankingModelResult = {
  resultId: string;
  modelId: string;
  modelName: string;
  username: string;
  groupName: string | null;
  status: string;
  error: string | null;
  outputPath: string | null;
  questionResults: ModelQuestionResult[];
};

function modelOwnerName(model: { name: string; user: { username: string } }) {
  return model.user.username;
}

async function loadRankingBatch(batchId: string) {
  return prisma.modelTestBatch.findUnique({
    where: { id: batchId },
    include: { results: { include: { model: { include: { user: true, group: true } } }, orderBy: { createdAt: "asc" } } },
  });
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error != null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function sortQuestionResults(questionResults: ModelQuestionResult[], questionIds: string[]) {
  const order = new Map(questionIds.map((id, index) => [id, index] as const));
  return [...questionResults].sort((left, right) =>
    (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id, "zh-CN")
  );
}

function mergeQuestionResult(questionResults: ModelQuestionResult[], nextResult: ModelQuestionResult, questionIds: string[]) {
  const merged = new Map(questionResults.map((item) => [item.id, item] as const));
  merged.set(nextResult.id, nextResult);
  return sortQuestionResults([...merged.values()], questionIds);
}

function serializeQuestionResults(questionResults: ModelQuestionResult[]) {
  return JSON.stringify({ answers: questionResults }, null, 2);
}

function deriveRankingResultStatus(questionResults: ModelQuestionResult[], questionCount: number) {
  if (questionResults.length < questionCount) return "RUNNING";
  const successfulCount = questionResults.filter((item) => item.status === "SCORED" && item.answer?.trim()).length;
  if (successfulCount >= questionCount) return "SCORED";
  if (successfulCount > 0) return "PARTIAL";
  const fallback = questionResults.find((item) => item.status !== "SCORED")?.status;
  return fallback ?? "INVALID_OUTPUT";
}

function deriveRankingResultError(questionResults: ModelQuestionResult[]) {
  const failures = questionResults.filter((item) => item.status !== "SCORED");
  if (!failures.length) return null;
  return normalizeQuestionError(failures[failures.length - 1]);
}

function sortQuestionReports(questions: { id: string }[], questionReports: JudgeQuestionReport[]) {
  const reportById = new Map(questionReports.map((report) => [report.questionId, report] as const));
  return questions.map((question) => reportById.get(question.id)).filter((report): report is JudgeQuestionReport => Boolean(report));
}

function sortRawResponses(questions: { id: string }[], questionReports: JudgeQuestionReport[], rawResponses: RankingRawResponse[]) {
  const rawResponseById = new Map(rawResponses.map((item) => [item.questionId, item.rawResponse] as const));
  const judgedIds = new Set(questionReports.map((report) => report.questionId));
  return questions
    .filter((question) => judgedIds.has(question.id))
    .map((question) => ({ questionId: question.id, rawResponse: rawResponseById.get(question.id) ?? null }));
}

function parseStoredJudgeReports(value: string | null, questions: { id: string; question: string }[]) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Partial<JudgeBatchReport>;
    if (!Array.isArray(parsed.questions)) return [];
    const questionIdSet = new Set(questions.map((question) => question.id));
    return parsed.questions.filter((report): report is JudgeQuestionReport =>
      Boolean(report && typeof report === "object" && typeof report.questionId === "string" && questionIdSet.has(report.questionId)),
    );
  } catch {
    return [];
  }
}

function parseStoredRawResponses(value: string | null, questions: { id: string }[]) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as { questions?: RankingRawResponse[] };
    if (!Array.isArray(parsed.questions)) return [];
    const questionIdSet = new Set(questions.map((question) => question.id));
    return parsed.questions.filter((item): item is RankingRawResponse =>
      Boolean(item && typeof item === "object" && typeof item.questionId === "string" && questionIdSet.has(item.questionId)),
    );
  } catch {
    return [];
  }
}

async function readStoredQuestionResults(outputPath: string | null | undefined, questions: { id: string; question: string }[]) {
  if (!outputPath) return [];
  try {
    return sortQuestionResults(readModelQuestionResults(await readFile(outputPath, "utf8")), questions.map((question) => question.id));
  } catch (error) {
    if (isMissingFileError(error)) return [];
    return questions.map((question) => ({
      id: question.id,
      question: question.question,
      status: "INVALID_OUTPUT" as const,
      answer: null,
      error: error instanceof Error ? error.message : "Invalid model output",
      durationMs: null,
      peakMemoryKb: null,
    }));
  }
}

async function buildRankingExecutionState(batch: LoadedRankingBatch) {
  const questions = readModelQuestions(await readFile(modelRankingPaths(batch.id).questionPath, "utf8"));
  const input: RankingJudgeBatchInput = {
    batchId: batch.id,
    questionSource: modelRankingQuestionSourceLabel,
    questionCount: questions.length,
    questions: questions.map((question) => ({ questionId: question.id, question: question.question, answers: [], failures: [] })),
  };
  const questionInputById = new Map(input.questions.map((question) => [question.questionId, question] as const));
  const parsedModelResults: ParsedRankingModelResult[] = [];

  for (const result of batch.results) {
    const defaultOutputPath = resolve(modelRunPaths(result.modelId, batch.id).outputPath);
    const questionResults = await readStoredQuestionResults(result.outputPath ?? defaultOutputPath, questions);
    const questionResultById = new Map(questionResults.map((item) => [item.id, item] as const));
    for (const question of questions) {
      const questionInput = questionInputById.get(question.id);
      if (!questionInput) continue;
      const questionResult = questionResultById.get(question.id);
      if (questionResult?.answer?.trim()) {
        questionInput.answers.push({
          modelId: result.modelId,
          modelName: result.model.name,
          username: modelOwnerName(result.model),
          answer: questionResult.answer.trim(),
          status: questionResult.status,
          error: questionResult.error ?? null,
          durationMs: questionResult.durationMs ?? null,
          peakMemoryKb: questionResult.peakMemoryKb ?? null,
        });
        continue;
      }
      if (!questionResult) continue;
      questionInput.failures.push({
        modelId: result.modelId,
        modelName: result.model.name,
        username: modelOwnerName(result.model),
        status: questionResult.status,
        error: normalizeQuestionError(questionResult),
      });
    }
    parsedModelResults.push({
      resultId: result.id,
      modelId: result.modelId,
      modelName: result.model.name,
      username: modelOwnerName(result.model),
      groupName: result.model.group?.name ?? null,
      status: result.status,
      error: result.error,
      outputPath: result.outputPath ?? defaultOutputPath,
      questionResults,
    });
  }

  return { questions, input, parsedModelResults };
}

async function persistRankingJudgeProgress({
  batchId,
  questions,
  input,
  questionReports,
  rawResponses,
  judgeStartedAt,
}: {
  batchId: string;
  questions: { id: string; question: string }[];
  input: RankingJudgeBatchInput;
  questionReports: JudgeQuestionReport[];
  rawResponses: RankingRawResponse[];
  judgeStartedAt: Date;
}) {
  const orderedReports = sortQuestionReports(questions, questionReports);
  const orderedRawResponses = sortRawResponses(questions, orderedReports, rawResponses);
  const judgeInputPath = await writeJudgeInput(batchId, input);
  await prisma.modelTestBatch.update({
    where: { id: batchId },
    data: {
      status: "RUNNING",
      judgeStatus: "RUNNING",
      judgeStartedAt,
      judgeInputPath,
      judgeRawResponse: JSON.stringify({ questions: orderedRawResponses }).slice(0, 60000),
      judgeReport: JSON.stringify({
        version: 2,
        questionSource: modelRankingQuestionSourceLabel,
        questionCount: questions.length,
        summaryReport: `共 ${questions.length} 题，已完成 ${orderedReports.length} 题逐题质量排名。`,
        questions: orderedReports,
      }),
      judgeError: null,
    },
  });
  return { judgeInputPath, orderedReports, orderedRawResponses };
}

async function finalizeRankingBatch({
  batch,
  questions,
  input,
  parsedModelResults,
  questionReports,
  rawResponses,
}: {
  batch: LoadedRankingBatch;
  questions: { id: string; question: string }[];
  input: RankingJudgeBatchInput;
  parsedModelResults: ParsedRankingModelResult[];
  questionReports: JudgeQuestionReport[];
  rawResponses: RankingRawResponse[];
}) {
  const orderedReports = sortQuestionReports(questions, questionReports);
  const orderedRawResponses = sortRawResponses(questions, orderedReports, rawResponses);
  const judgeCompletedAt = new Date();
  const judgeInputPath = await writeJudgeInput(batch.id, input);
  const snapshot = buildLeaderboardSnapshot({
    batchId: batch.id,
    questionSummary: batch.question,
    questionSource: modelRankingQuestionSourceLabel,
    createdAt: batch.createdAt,
    completedAt: batch.completedAt ?? judgeCompletedAt,
    judgeCompletedAt,
    questions,
    questionReports: orderedReports,
    modelResults: parsedModelResults,
  });
  await writeLeaderboardSnapshot(batch.id, snapshot);
  await prisma.modelTestBatch.update({
    where: { id: batch.id },
    data: {
      status: "COMPLETED",
      completedAt: batch.completedAt ?? judgeCompletedAt,
      judgeStatus: "COMPLETED",
      judgeStartedAt: batch.judgeStartedAt ?? judgeCompletedAt,
      judgeInputPath,
      judgeRawResponse: JSON.stringify({ questions: orderedRawResponses }).slice(0, 60000),
      judgeRankingsJson: JSON.stringify(snapshot.qualityRankings),
      judgeReport: JSON.stringify({
        version: 2,
        questionSource: modelRankingQuestionSourceLabel,
        questionCount: snapshot.batch.questionCount,
        summaryReport: `共 ${snapshot.batch.questionCount} 题，已完成逐题质量排名。`,
        questions: orderedReports,
      }),
      judgeCompletedAt,
      judgeError: null,
    },
  });
}

async function executeRankingQuestion({
  batch,
  modelResult,
  question,
  questions,
  existingQuestionResults,
}: {
  batch: LoadedRankingBatch;
  modelResult: LoadedRankingBatchResult;
  question: { id: string; question: string };
  questions: { id: string; question: string }[];
  existingQuestionResults: ModelQuestionResult[];
}) {
  const startedAt = new Date();
  await prisma.modelTestBatch.update({
    where: { id: batch.id },
    data: { status: "RUNNING", startedAt: batch.startedAt ?? startedAt, judgeError: null },
  });
  await prisma.modelTestResult.update({
    where: { id: modelResult.id },
    data: { status: "RUNNING", startedAt: modelResult.startedAt ?? startedAt, error: null },
  });

  const paths = modelRunPaths(modelResult.modelId, batch.id);
  const tempOutputPath = join(paths.runDir, `${question.id}.partial.json`);
  let nextQuestionResult: ModelQuestionResult;
  try {
    await mkdir(paths.runDir, { recursive: true });
    const execution = await runModelQuestionsIndividually({
      entrypointPath: modelResult.model.entrypointPath,
      workingDir: modelResult.model.packageDir,
      outputPath: tempOutputPath,
      questions: [question],
      timeoutMs: modelRuntimeLimitMs,
    });
    const output = execution.outputText ?? await readFile(tempOutputPath, "utf8");
    nextQuestionResult = readModelQuestionResults(output)[0] ?? {
      id: question.id,
      question: question.question,
      status: "INVALID_OUTPUT",
      error: "单题执行未返回结果",
      durationMs: null,
      peakMemoryKb: null,
    };
  } catch (error) {
    nextQuestionResult = {
      id: question.id,
      question: question.question,
      status: "INVALID_OUTPUT",
      error: error instanceof Error ? error.message : "单题执行失败",
      durationMs: null,
      peakMemoryKb: null,
    };
  } finally {
    await rm(tempOutputPath, { force: true }).catch(() => undefined);
  }

  const mergedQuestionResults = mergeQuestionResult(
    existingQuestionResults,
    {
      ...nextQuestionResult,
      id: question.id,
      question: question.question,
    },
    questions.map((item) => item.id),
  );
  const mergedOutput = serializeQuestionResults(mergedQuestionResults);
  await writeFile(paths.outputPath, mergedOutput);

  const successfulQuestionResults = mergedQuestionResults.filter((item) => item.status === "SCORED");
  const durationMs = averageMetric(successfulQuestionResults.map((item) => item.durationMs ?? null));
  const peakMemoryKb = averageMetric(successfulQuestionResults.map((item) => item.peakMemoryKb ?? null));
  const status = deriveRankingResultStatus(mergedQuestionResults, questions.length);
  await prisma.modelTestResult.update({
    where: { id: modelResult.id },
    data: {
      status,
      durationMs,
      peakMemoryKb,
      outputPath: resolve(paths.outputPath),
      outputPreview: mergedOutput.slice(0, outputLimit),
      error: deriveRankingResultError(mergedQuestionResults),
      completedAt: mergedQuestionResults.length >= questions.length ? new Date() : null,
    },
  });
}

async function processRankingBatch(batchId: string) {
  const batch = await loadRankingBatch(batchId);
  if (!batch || batch.kind !== "RANKING") return;
  if (batch.status === "COMPLETED" && batch.judgeStatus === "COMPLETED") return;
  try {
    await prisma.modelTestBatch.update({
      where: { id: batchId },
      data: { status: "RUNNING", startedAt: batch.startedAt ?? new Date(), judgeError: null },
    });
    const { questions, input, parsedModelResults } = await buildRankingExecutionState(batch);
    const storedQuestionReports = parseStoredJudgeReports(batch.judgeReport, questions);
    const storedRawResponses = parseStoredRawResponses(batch.judgeRawResponse, questions);
    const questionReportMap = new Map(storedQuestionReports.map((report) => [report.questionId, report] as const));
    const rawResponseMap = new Map(storedRawResponses.map((item) => [item.questionId, item.rawResponse] as const));

    for (const question of questions) {
      const questionInput = input.questions.find((item) => item.questionId === question.id);
      if (!questionInput) continue;
      const missingModel = parsedModelResults.find((result) => !result.questionResults.some((item) => item.id === question.id));
      if (missingModel) {
        const targetResult = batch.results.find((result) => result.id === missingModel.resultId);
        if (!targetResult) throw new Error(`未找到批次结果 ${missingModel.resultId}`);
        await executeRankingQuestion({
          batch,
          modelResult: targetResult,
          question,
          questions,
          existingQuestionResults: missingModel.questionResults,
        });
        return;
      }
      if (questionReportMap.has(question.id)) continue;
      const judgeStartedAt = batch.judgeStartedAt ?? new Date();
      await prisma.modelTestBatch.update({
        where: { id: batchId },
        data: { judgeStatus: "RUNNING", judgeStartedAt, judgeError: null },
      });
      const judged = questionInput.answers.length === 0
        ? { report: createEmptyJudgeReport(questionInput), rawResponse: null }
        : await judgeModelRanking(questionInput);
      questionReportMap.set(question.id, judged.report);
      rawResponseMap.set(question.id, judged.rawResponse);
      const questionReports = questions
        .map((item) => questionReportMap.get(item.id))
        .filter((report): report is JudgeQuestionReport => Boolean(report));
      const rawResponses = questions
        .filter((item) => questionReportMap.has(item.id))
        .map((item) => ({ questionId: item.id, rawResponse: rawResponseMap.get(item.id) ?? null }));
      if (questionReports.length >= questions.length) {
        await finalizeRankingBatch({
          batch,
          questions,
          input,
          parsedModelResults,
          questionReports,
          rawResponses,
        });
      } else {
        await persistRankingJudgeProgress({
          batchId,
          questions,
          input,
          questionReports,
          rawResponses,
          judgeStartedAt,
        });
      }
      return;
    }

    await finalizeRankingBatch({
      batch,
      questions,
      input,
      parsedModelResults,
      questionReports: [...questionReportMap.values()],
      rawResponses: [...rawResponseMap.entries()].map(([questionId, rawResponse]) => ({ questionId, rawResponse })),
    });
  } catch (err) {
    await prisma.modelTestBatch.update({ where: { id: batchId }, data: { judgeStatus: "FAILED", judgeError: err instanceof Error ? err.message : "裁判评测失败", judgeCompletedAt: new Date() } });
  }
}

async function tick() {
  const rankingBatch = await prisma.modelTestBatch.findFirst({
    where: {
      kind: "RANKING",
      OR: [
        { status: { in: ["PENDING", "RUNNING"] } },
        { judgeStatus: { in: ["PENDING", "RUNNING"] } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  if (rankingBatch) {
    await processRankingBatch(rankingBatch.id);
    return;
  }
}

async function recoverInterruptedWork() {
  await prisma.modelTestResult.updateMany({ where: { status: "RUNNING", batch: { kind: "RANKING" } }, data: { status: "PENDING", error: "Worker restarted before this ranking question finished; retrying." } });
  await prisma.modelTestBatch.updateMany({ where: { kind: "RANKING", status: "RUNNING" }, data: { status: "PENDING" } });
  await prisma.modelTestBatch.updateMany({ where: { kind: "RANKING", judgeStatus: "RUNNING" }, data: { judgeStatus: "PENDING", judgeError: "Worker restarted before judge finished; retrying." } });
}

async function main() {
  console.log("Bench AI model worker started");
  await recoverInterruptedWork();
  for (;;) {
    try { await tick(); } catch (err) { console.error(err); }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

main().finally(() => prisma.$disconnect());

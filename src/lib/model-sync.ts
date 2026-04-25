import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type LeaderboardSnapshot } from "./model-leaderboard";
import { modelRankingPaths, modelRankingQuestionSourceLabel } from "./model-ranking";
import { readModelQuestionResults, type ModelQuestionResult } from "./model-runner";
import { existingModelUploadIds, modelRunPaths, readModelUploadMetadata } from "./model-upload";
import { prisma } from "./prisma";

export type ModelUploadSyncResult = {
  uploadIds: string[];
  restoredModelIds: string[];
  restoredBatchIds: string[];
  restoredResultIds: string[];
  orphanUploadIds: string[];
  invalidUploadIds: string[];
  invalidBatchIds: string[];
};

const outputPreviewLimit = 4000;
const modelRankingsRoot = join(/*turbopackIgnore: true*/ process.cwd(), "uploads", "model-rankings");

export async function syncModelArtifactsWithUploads(): Promise<ModelUploadSyncResult> {
  const uploadIds = await existingModelUploadIds();
  if (!uploadIds.length) {
    return { uploadIds: [], restoredModelIds: [], restoredBatchIds: [], restoredResultIds: [], orphanUploadIds: [], invalidUploadIds: [], invalidBatchIds: [] };
  }

  const [users, existingModels] = await Promise.all([
    prisma.user.findMany({
      where: { username: { in: uploadIds }, role: "USER" },
      include: { group: true },
    }),
    prisma.modelArtifact.findMany({ where: { id: { in: uploadIds } }, select: { id: true, userId: true } }),
  ]);
  const userByUsername = new Map(users.map((user) => [user.username, user]));
  const existingModelById = new Map(existingModels.map((model) => [model.id, model]));
  const restoredModelIds: string[] = [];
  const orphanUploadIds: string[] = [];
  const invalidUploadIds: string[] = [];

  for (const uploadId of uploadIds) {
    const user = userByUsername.get(uploadId);
    if (!user) {
      orphanUploadIds.push(uploadId);
      continue;
    }
    const existingModel = existingModelById.get(uploadId);

    try {
      const metadata = await readModelUploadMetadata(uploadId);
      await prisma.modelArtifact.upsert({
        where: { id: uploadId },
        update: {
          userId: user.id,
          groupId: user.groupId,
          name: uploadId,
          archivePath: metadata.archivePath,
          packageDir: metadata.packageDir,
          entrypointPath: metadata.entrypointPath,
        },
        create: {
          id: uploadId,
          userId: user.id,
          groupId: user.groupId,
          name: uploadId,
          originalFilename: metadata.originalFilename,
          archivePath: metadata.archivePath,
          packageDir: metadata.packageDir,
          entrypointPath: metadata.entrypointPath,
          enabled: true,
          createdAt: metadata.createdAt,
        },
      });
      if (!existingModel) restoredModelIds.push(uploadId);
    } catch {
      invalidUploadIds.push(uploadId);
    }
  }

  const rankingSync = await syncRankingBatchesFromLocalFiles(uploadIds);

  return {
    uploadIds,
    restoredModelIds,
    restoredBatchIds: rankingSync.restoredBatchIds,
    restoredResultIds: rankingSync.restoredResultIds,
    orphanUploadIds,
    invalidUploadIds,
    invalidBatchIds: rankingSync.invalidBatchIds,
  };
}

export async function getSyncedModelUploadIds() {
  return (await syncModelArtifactsWithUploads()).uploadIds;
}

async function localRankingBatchIds() {
  const entries = await readdir(modelRankingsRoot, { withFileTypes: true }).catch(() => []);
  const ids = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try {
      await stat(modelRankingPaths(entry.name).leaderboardSnapshotPath);
      return entry.name;
    } catch {
      return null;
    }
  }));
  return ids.filter((id): id is string => Boolean(id)).sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function parseDate(value: string | null | undefined, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

function intOrNull(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? null : Math.round(value);
}

function normalizeQuestionReports(snapshot: LeaderboardSnapshot) {
  return snapshot.questions.map((question) => ({
    questionId: question.questionId,
    question: question.question,
    rankings: question.rankings,
    summaryReport: question.summaryReport,
    strengths: question.strengths,
    weaknesses: question.weaknesses,
    recommendations: question.recommendations,
    answerCount: question.answerCount,
    failuresCount: question.failuresCount,
  }));
}

function rankingJudgeReport(snapshot: LeaderboardSnapshot) {
  return JSON.stringify({
    version: 2,
    questionSource: snapshot.batch.questionSource ?? modelRankingQuestionSourceLabel,
    questionCount: snapshot.batch.questionCount,
    summaryReport: `共 ${snapshot.batch.questionCount} 题，已完成逐题质量排名。`,
    questions: normalizeQuestionReports(snapshot),
  });
}

async function readRankingSnapshot(batchId: string) {
  const snapshotText = await readFile(modelRankingPaths(batchId).leaderboardSnapshotPath, "utf8");
  const snapshot = JSON.parse(snapshotText) as LeaderboardSnapshot;
  if (!snapshot || snapshot.version !== 2 || snapshot.batch?.id !== batchId || !Array.isArray(snapshot.entries)) {
    throw new Error(`无法识别排名快照: ${batchId}`);
  }
  return snapshot;
}

async function readOptionalText(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function resultError(questionResults: ModelQuestionResult[]) {
  const failed = questionResults.filter((result) => result.status !== "SCORED");
  return failed.at(-1)?.error?.slice(0, outputPreviewLimit) ?? null;
}

async function readModelRunOutput(modelId: string, batchId: string) {
  const outputPath = resolve(modelRunPaths(modelId, batchId).outputPath);
  const outputText = await readOptionalText(outputPath);
  if (!outputText) return { outputPath, outputPreview: null, questionResults: [] as ModelQuestionResult[] };
  try {
    return {
      outputPath,
      outputPreview: outputText.slice(0, outputPreviewLimit),
      questionResults: readModelQuestionResults(outputText),
    };
  } catch {
    return {
      outputPath,
      outputPreview: outputText.slice(0, outputPreviewLimit),
      questionResults: [] as ModelQuestionResult[],
    };
  }
}

async function restoreActorId() {
  const actor = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (actor) return actor.id;
  return (await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id ?? null;
}

async function syncRankingBatchesFromLocalFiles(uploadIds: string[]) {
  const batchIds = await localRankingBatchIds();
  const restoredBatchIds: string[] = [];
  const restoredResultIds: string[] = [];
  const invalidBatchIds: string[] = [];
  if (!batchIds.length) return { restoredBatchIds, restoredResultIds, invalidBatchIds };

  const [actorId, models] = await Promise.all([
    restoreActorId(),
    prisma.modelArtifact.findMany({ where: { id: { in: uploadIds } }, select: { id: true } }),
  ]);
  if (!actorId) return { restoredBatchIds, restoredResultIds, invalidBatchIds: batchIds };

  const modelIds = new Set(models.map((model) => model.id));
  const existingBatches = await prisma.modelTestBatch.findMany({ where: { id: { in: batchIds } }, select: { id: true } });
  const existingBatchIds = new Set(existingBatches.map((batch) => batch.id));

  for (const batchId of batchIds) {
    try {
      const snapshot = await readRankingSnapshot(batchId);
      const snapshotStat = await stat(modelRankingPaths(batchId).leaderboardSnapshotPath);
      const createdAt = parseDate(snapshot.batch.createdAt, snapshotStat.birthtime);
      const completedAt = parseDate(snapshot.batch.completedAt, snapshotStat.mtime);
      const judgeCompletedAt = parseDate(snapshot.batch.judgeCompletedAt, completedAt);
      const judgeInputPath = resolve(modelRankingPaths(batchId).judgeInputPath);

      await prisma.modelTestBatch.upsert({
        where: { id: batchId },
        update: {
          kind: "RANKING",
          status: "COMPLETED",
          question: snapshot.batch.questionSummary,
          completedAt,
          judgeStatus: "COMPLETED",
          judgeInputPath,
          judgeRankingsJson: JSON.stringify(snapshot.qualityRankings ?? []),
          judgeReport: rankingJudgeReport(snapshot),
          judgeCompletedAt,
          judgeError: null,
        },
        create: {
          id: batchId,
          kind: "RANKING",
          status: "COMPLETED",
          question: snapshot.batch.questionSummary,
          createdById: actorId,
          createdAt,
          startedAt: createdAt,
          completedAt,
          judgeStatus: "COMPLETED",
          judgeInputPath,
          judgeRankingsJson: JSON.stringify(snapshot.qualityRankings ?? []),
          judgeReport: rankingJudgeReport(snapshot),
          judgeStartedAt: completedAt,
          judgeCompletedAt,
        },
      });
      if (!existingBatchIds.has(batchId)) restoredBatchIds.push(batchId);

      for (const entry of snapshot.entries) {
        if (!modelIds.has(entry.modelId)) continue;
        const existingResult = await prisma.modelTestResult.findUnique({
          where: { batchId_modelId: { batchId, modelId: entry.modelId } },
          select: { id: true },
        });
        const output = await readModelRunOutput(entry.modelId, batchId);
        await prisma.modelTestResult.upsert({
          where: { batchId_modelId: { batchId, modelId: entry.modelId } },
          update: {
            status: entry.status,
            durationMs: intOrNull(entry.averageDurationMs),
            peakMemoryKb: intOrNull(entry.averagePeakMemoryKb),
            outputPath: output.outputPath,
            outputPreview: output.outputPreview,
            error: resultError(output.questionResults),
            completedAt,
          },
          create: {
            batchId,
            modelId: entry.modelId,
            status: entry.status,
            durationMs: intOrNull(entry.averageDurationMs),
            peakMemoryKb: intOrNull(entry.averagePeakMemoryKb),
            outputPath: output.outputPath,
            outputPreview: output.outputPreview,
            error: resultError(output.questionResults),
            createdAt,
            startedAt: createdAt,
            completedAt,
          },
        });
        if (!existingResult) restoredResultIds.push(`${batchId}:${entry.modelId}`);
      }
    } catch {
      invalidBatchIds.push(batchId);
    }
  }

  return { restoredBatchIds, restoredResultIds, invalidBatchIds };
}

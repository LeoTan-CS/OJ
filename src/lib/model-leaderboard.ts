import { readFile } from "node:fs/promises";
import { modelRankingPaths, type JudgeQuestionReport, type JudgeRanking } from "@/lib/model-ranking";
import type { ModelQuestion, ModelQuestionResult } from "@/lib/model-runner";

const rankScoreBands = [
  { maxRank: 3, score: 100 },
  { maxRank: 5, score: 97 },
  { maxRank: 10, score: 95 },
  { maxRank: 20, score: 90 },
  { maxRank: 30, score: 85 },
  { maxRank: 40, score: 80 },
  { maxRank: 50, score: 75 },
  { maxRank: 60, score: 70 },
  { maxRank: 70, score: 65 },
  { maxRank: Number.POSITIVE_INFINITY, score: 60 },
] as const;
const qualityWeight = 0.8;
const timeWeight = 0.1;
const memoryWeight = 0.1;

type RankingResultSource = {
  modelId: string;
  status: string;
  durationMs: number | null;
  peakMemoryKb: number | null;
  outputPath?: string | null;
  model: {
    id: string;
    name: string;
    user: {
      username: string;
    };
  };
};

export type RankingBatchSource = {
  id: string;
  question: string | null;
  createdAt: Date;
  completedAt: Date | null;
  judgeCompletedAt: Date | null;
  judgeRankingsJson: string | null;
  results: RankingResultSource[];
};

export type LeaderboardQuestionEntry = {
  modelId: string;
  modelName: string;
  username: string;
  status: string;
  durationMs: number | null;
  peakMemoryKb: number | null;
  qualityRank: number | null;
  qualityScore: number;
  timeRank: number | null;
  timeScore: number;
  memoryRank: number | null;
  memoryScore: number;
  totalScore: number;
};

export type LeaderboardBatchEntry = {
  modelId: string;
  modelName: string;
  username: string;
  isCurrentUser?: boolean;
  status: string;
  questionCount: number;
  successfulQuestions: number;
  averageDurationMs: number | null;
  averagePeakMemoryKb: number | null;
  qualityAverage: number;
  timeAverage: number;
  memoryAverage: number;
  totalScore: number;
};

export type LeaderboardQuestionSnapshot = JudgeQuestionReport & {
  entries: LeaderboardQuestionEntry[];
};

export type LeaderboardSnapshot = {
  version: 2;
  batch: {
    id: string;
    questionSummary: string | null;
    questionSource: string;
    questionCount: number;
    createdAt: string;
    completedAt: string | null;
    judgeCompletedAt: string | null;
  };
  qualityRankings: JudgeRanking[];
  questions: LeaderboardQuestionSnapshot[];
  entries: LeaderboardBatchEntry[];
};

type LegacyLeaderboardSnapshot = {
  version: 1;
  batch: {
    id: string;
    question: string | null;
    createdAt: string;
    completedAt: string | null;
    judgeCompletedAt: string | null;
  };
  entries: Array<{
    modelId: string;
    modelName: string;
    username: string;
    status: string;
    durationMs: number | null;
    peakMemoryKb: number | null;
    qualityScore: number;
    timeScore: number;
    memoryScore: number;
    totalScore: number;
  }>;
};

export type LeaderboardBatch = {
  batchId: string;
  questionSummary: string | null;
  questionCount: number;
  createdAt: string;
  completedAt: string | null;
  judgeCompletedAt: string | null;
  entries: LeaderboardBatchEntry[];
};

export type LeaderboardTotalDetail = LeaderboardBatchEntry & {
  batchId: string;
  questionSummary: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type LeaderboardTotalEntry = {
  modelId: string;
  modelName: string;
  username: string;
  isCurrentUser?: boolean;
  appearances: number;
  qualityTotal: number;
  timeTotal: number;
  memoryTotal: number;
  totalScore: number;
  details: LeaderboardTotalDetail[];
};

export type ModelLeaderboardData = {
  batches: LeaderboardBatch[];
  totals: LeaderboardTotalEntry[];
};

type AnonymousModelIdentity = {
  modelId: string;
  modelName: string;
  username: string;
};

type LeaderboardIdentityFields = {
  modelId: string;
  modelName: string;
  username: string;
  isCurrentUser?: boolean;
};

const publicLeaderboardModelIds = new Set(["user1"]);
const publicLeaderboardUsernames = new Set(["user1"]);

export type RankingBatchLeaderboardInput = {
  batchId: string;
  questionSummary: string | null;
  questionSource: string;
  createdAt: Date;
  completedAt: Date | null;
  judgeCompletedAt: Date | null;
  questions: ModelQuestion[];
  questionReports: JudgeQuestionReport[];
  modelResults: Array<{
    modelId: string;
    modelName: string;
    username: string;
    status: string;
    questionResults: ModelQuestionResult[];
  }>;
};

function pointsForRank(rank: number | null | undefined) {
  const numericRank = Number(rank);
  if (!Number.isFinite(numericRank) || numericRank < 1) return 0;
  return rankScoreBands.find((band) => numericRank <= band.maxRank)?.score ?? 0;
}

function weightedTotalScore(qualityScore: number, timeScore: number, memoryScore: number) {
  return qualityScore * qualityWeight + timeScore * timeWeight + memoryScore * memoryWeight;
}

function averageScores(values: number[], denominator: number) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(denominator, 1);
}

function toIsoString(value: Date | null) {
  return value ? value.toISOString() : null;
}

function meanOrNull(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function buildMetricRankMap(items: Array<{ modelId: string; value: number }>, descending = false) {
  const sorted = [...items].sort((left, right) => {
    const delta = descending ? right.value - left.value : left.value - right.value;
    return delta || left.modelId.localeCompare(right.modelId, "zh-CN");
  });
  const ranks = new Map<string, number>();
  for (let index = 0; index < sorted.length;) {
    const start = index;
    const value = sorted[index].value;
    while (index < sorted.length && sorted[index].value === value) index += 1;
    const rank = start + 1;
    for (let cursor = start; cursor < index; cursor += 1) ranks.set(sorted[cursor].modelId, rank);
  }
  return ranks;
}

function sortQuestionEntries(entries: LeaderboardQuestionEntry[]) {
  return [...entries].sort((left, right) =>
    right.totalScore - left.totalScore
    || right.qualityScore - left.qualityScore
    || right.timeScore - left.timeScore
    || right.memoryScore - left.memoryScore
    || (left.durationMs ?? Number.POSITIVE_INFINITY) - (right.durationMs ?? Number.POSITIVE_INFINITY)
    || left.modelName.localeCompare(right.modelName, "zh-CN")
  );
}

function sortBatchEntries(entries: LeaderboardBatchEntry[]) {
  return [...entries].sort((left, right) =>
    right.totalScore - left.totalScore
    || right.qualityAverage - left.qualityAverage
    || right.timeAverage - left.timeAverage
    || right.memoryAverage - left.memoryAverage
    || (left.averageDurationMs ?? Number.POSITIVE_INFINITY) - (right.averageDurationMs ?? Number.POSITIVE_INFINITY)
  );
}

function sortTotalEntries(entries: LeaderboardTotalEntry[]) {
  return [...entries].sort((left, right) =>
    right.totalScore - left.totalScore
    || right.qualityTotal - left.qualityTotal
    || right.timeTotal - left.timeTotal
    || right.memoryTotal - left.memoryTotal
    || right.appearances - left.appearances
    || left.modelName.localeCompare(right.modelName, "zh-CN")
  );
}

function buildAggregateQualityRankings(entries: LeaderboardBatchEntry[]) {
  const qualityRanks = buildMetricRankMap(
    entries.map((entry) => ({ modelId: entry.modelId, value: entry.qualityAverage })),
    true,
  );
  return [...entries]
    .sort((left, right) => right.qualityAverage - left.qualityAverage || left.modelName.localeCompare(right.modelName, "zh-CN"))
    .map((entry) => ({
      rank: qualityRanks.get(entry.modelId) ?? 1,
      modelId: entry.modelId,
      modelName: entry.modelName,
      averageScore: entry.qualityAverage,
      reason: `质量均分 ${entry.qualityAverage.toFixed(2)}`,
    }));
}

function normalizeQuestionSnapshot(question: LeaderboardQuestionSnapshot): LeaderboardQuestionSnapshot {
  const qualityRanks = new Map(question.rankings.map((ranking) => [ranking.modelId, ranking.rank] as const));
  const timeRanks = buildMetricRankMap(
    question.entries
      .filter((entry) => entry.status === "SCORED" && entry.durationMs != null)
      .map((entry) => ({ modelId: entry.modelId, value: entry.durationMs! })),
  );
  const memoryRanks = buildMetricRankMap(
    question.entries
      .filter((entry) => entry.status === "SCORED" && entry.peakMemoryKb != null)
      .map((entry) => ({ modelId: entry.modelId, value: entry.peakMemoryKb! })),
  );

  return {
    ...question,
    entries: sortQuestionEntries(question.entries.map((entry) => {
      const qualityRank = qualityRanks.get(entry.modelId) ?? entry.qualityRank ?? null;
      const timeRank = timeRanks.get(entry.modelId) ?? null;
      const memoryRank = memoryRanks.get(entry.modelId) ?? null;
      const qualityScore = pointsForRank(qualityRank);
      const timeScore = pointsForRank(timeRank);
      const memoryScore = pointsForRank(memoryRank);
      return {
        ...entry,
        qualityRank,
        qualityScore,
        timeRank,
        timeScore,
        memoryRank,
        memoryScore,
        totalScore: weightedTotalScore(qualityScore, timeScore, memoryScore),
      };
    })),
  };
}

function recalculateBatchEntriesFromQuestions(
  entries: LeaderboardBatchEntry[],
  questions: LeaderboardQuestionSnapshot[],
  questionCount: number,
) {
  return sortBatchEntries(entries.map((entry) => {
    const questionEntries = questions
      .map((question) => question.entries.find((questionEntry) => questionEntry.modelId === entry.modelId))
      .filter((questionEntry): questionEntry is LeaderboardQuestionEntry => Boolean(questionEntry));
    return {
      ...entry,
      questionCount,
      qualityAverage: averageScores(questionEntries.map((questionEntry) => questionEntry.qualityScore), questionCount),
      timeAverage: averageScores(questionEntries.map((questionEntry) => questionEntry.timeScore), questionCount),
      memoryAverage: averageScores(questionEntries.map((questionEntry) => questionEntry.memoryScore), questionCount),
      totalScore: averageScores(questionEntries.map((questionEntry) => questionEntry.totalScore), questionCount),
    };
  }));
}

export function buildLeaderboardSnapshot(input: RankingBatchLeaderboardInput): LeaderboardSnapshot {
  const reportByQuestionId = new Map(input.questionReports.map((report) => [report.questionId, report] as const));

  const questionSnapshots = input.questions.map<LeaderboardQuestionSnapshot>((question) => {
    const report = reportByQuestionId.get(question.id) ?? {
      questionId: question.id,
      question: question.question,
      rankings: [],
      summaryReport: "本题没有有效裁判报告。",
      strengths: [],
      weaknesses: [],
      recommendations: [],
    };
    const qualityRanks = new Map(report.rankings.map((ranking) => [ranking.modelId, ranking.rank] as const));
    const timeRanks = buildMetricRankMap(
      input.modelResults
        .map((result) => ({ result, questionResult: result.questionResults.find((item) => item.id === question.id) ?? null }))
        .filter((item) => item.questionResult?.status === "SCORED" && item.questionResult.durationMs != null)
        .map((item) => ({ modelId: item.result.modelId, value: item.questionResult!.durationMs! })),
    );
    const memoryRanks = buildMetricRankMap(
      input.modelResults
        .map((result) => ({ result, questionResult: result.questionResults.find((item) => item.id === question.id) ?? null }))
        .filter((item) => item.questionResult?.status === "SCORED" && item.questionResult.peakMemoryKb != null)
        .map((item) => ({ modelId: item.result.modelId, value: item.questionResult!.peakMemoryKb! })),
    );

    const entries = input.modelResults.map<LeaderboardQuestionEntry>((result) => {
      const questionResult = result.questionResults.find((item) => item.id === question.id) ?? null;
      const qualityRank = qualityRanks.get(result.modelId) ?? null;
      const timeRank = timeRanks.get(result.modelId) ?? null;
      const memoryRank = memoryRanks.get(result.modelId) ?? null;
      const qualityScore = pointsForRank(qualityRank);
      const timeScore = pointsForRank(timeRank);
      const memoryScore = pointsForRank(memoryRank);
      return {
        modelId: result.modelId,
        modelName: result.modelName,
        username: result.username,
        status: questionResult?.status ?? result.status,
        durationMs: questionResult?.durationMs ?? null,
        peakMemoryKb: questionResult?.peakMemoryKb ?? null,
        qualityRank,
        qualityScore,
        timeRank,
        timeScore,
        memoryRank,
        memoryScore,
        totalScore: weightedTotalScore(qualityScore, timeScore, memoryScore),
      };
    });

    return {
      ...report,
      questionId: question.id,
      question: question.question,
      entries: sortQuestionEntries(entries),
    };
  });

  const entries = input.modelResults.map<LeaderboardBatchEntry>((result) => {
    const modelQuestionEntries = questionSnapshots.map((question) => question.entries.find((entry) => entry.modelId === result.modelId)!);
    const successfulQuestionCount = result.questionResults.filter((item) => item.status === "SCORED" && item.answer).length;
    const averageDurationMs = meanOrNull(result.questionResults.filter((item) => item.status === "SCORED").map((item) => item.durationMs ?? null));
    const averagePeakMemoryKb = meanOrNull(result.questionResults.filter((item) => item.status === "SCORED").map((item) => item.peakMemoryKb ?? null));
    const questionCount = input.questions.length;
    const qualityAverage = averageScores(modelQuestionEntries.map((item) => item.qualityScore), questionCount);
    const timeAverage = averageScores(modelQuestionEntries.map((item) => item.timeScore), questionCount);
    const memoryAverage = averageScores(modelQuestionEntries.map((item) => item.memoryScore), questionCount);
    const status = successfulQuestionCount >= questionCount ? "SCORED" : successfulQuestionCount > 0 ? "PARTIAL" : result.status;
    return {
      modelId: result.modelId,
      modelName: result.modelName,
      username: result.username,
      status,
      questionCount,
      successfulQuestions: successfulQuestionCount,
      averageDurationMs,
      averagePeakMemoryKb,
      qualityAverage,
      timeAverage,
      memoryAverage,
      totalScore: averageScores(modelQuestionEntries.map((item) => item.totalScore), questionCount),
    };
  });

  return {
    version: 2,
    batch: {
      id: input.batchId,
      questionSummary: input.questionSummary,
      questionSource: input.questionSource,
      questionCount: input.questions.length,
      createdAt: input.createdAt.toISOString(),
      completedAt: toIsoString(input.completedAt),
      judgeCompletedAt: toIsoString(input.judgeCompletedAt),
    },
    qualityRankings: buildAggregateQualityRankings(entries),
    questions: questionSnapshots,
    entries: sortBatchEntries(entries),
  };
}

function normalizeLeaderboardSnapshot(snapshot: LeaderboardSnapshot): LeaderboardSnapshot {
  const questions = snapshot.questions.map(normalizeQuestionSnapshot);
  const questionCount = snapshot.batch.questionCount || questions.length;
  const entries = recalculateBatchEntriesFromQuestions(snapshot.entries, questions, questionCount);
  return {
    ...snapshot,
    qualityRankings: buildAggregateQualityRankings(entries),
    questions,
    entries,
  };
}

function normalizeLegacyLeaderboardSnapshot(snapshot: LegacyLeaderboardSnapshot): LegacyLeaderboardSnapshot {
  return {
    ...snapshot,
    entries: snapshot.entries.map((entry) => ({
      ...entry,
      totalScore: weightedTotalScore(entry.qualityScore, entry.timeScore, entry.memoryScore),
    })),
  };
}

export async function readLeaderboardSnapshot(batchId: string) {
  try {
    const text = await readFile(modelRankingPaths(batchId).leaderboardSnapshotPath, "utf8");
    const parsed = JSON.parse(text) as LeaderboardSnapshot | LegacyLeaderboardSnapshot;
    if ("version" in parsed && parsed.version === 2) return normalizeLeaderboardSnapshot(parsed);
    if ("version" in parsed && parsed.version === 1) return normalizeLegacyLeaderboardSnapshot(parsed);
    return parsed;
  } catch {
    return null;
  }
}

function snapshotToBatch(snapshot: LeaderboardSnapshot): LeaderboardBatch {
  return {
    batchId: snapshot.batch.id,
    questionSummary: snapshot.batch.questionSummary,
    questionCount: snapshot.batch.questionCount,
    createdAt: snapshot.batch.createdAt,
    completedAt: snapshot.batch.completedAt,
    judgeCompletedAt: snapshot.batch.judgeCompletedAt,
    entries: sortBatchEntries(snapshot.entries),
  };
}

function legacySnapshotToBatch(snapshot: LegacyLeaderboardSnapshot): LeaderboardBatch {
  return {
    batchId: snapshot.batch.id,
    questionSummary: snapshot.batch.question,
    questionCount: 1,
    createdAt: snapshot.batch.createdAt,
    completedAt: snapshot.batch.completedAt,
    judgeCompletedAt: snapshot.batch.judgeCompletedAt,
    entries: sortBatchEntries(snapshot.entries.map((entry) => ({
      modelId: entry.modelId,
      modelName: entry.modelName,
      username: entry.username,
      status: entry.status,
      questionCount: 1,
      successfulQuestions: entry.status === "SCORED" ? 1 : 0,
      averageDurationMs: entry.durationMs,
      averagePeakMemoryKb: entry.peakMemoryKb,
      qualityAverage: entry.qualityScore,
      timeAverage: entry.timeScore,
      memoryAverage: entry.memoryScore,
      totalScore: entry.totalScore,
    }))),
  };
}

function parseLegacyJudgeRankings(text: string | null) {
  if (!text) return [] as JudgeRanking[];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [] as JudgeRanking[];
    return parsed
      .filter((item): item is JudgeRanking => Boolean(item) && typeof item === "object" && typeof (item as JudgeRanking).modelId === "string")
      .map((item) => ({
        rank: Number(item.rank),
        modelId: String(item.modelId),
        modelName: String(item.modelName),
        reason: String(item.reason ?? ""),
        score: item.score == null ? undefined : Number(item.score),
      }));
  } catch {
    return [] as JudgeRanking[];
  }
}

function buildLegacyLeaderboardBatch(batch: RankingBatchSource): LeaderboardBatch {
  const qualityByModel = new Map(parseLegacyJudgeRankings(batch.judgeRankingsJson).map((ranking) => [ranking.modelId, ranking.rank] as const));
  const timeRanks = buildMetricRankMap(
    batch.results
      .filter((result) => result.status === "SCORED" && result.durationMs != null)
      .map((result) => ({ modelId: result.modelId, value: result.durationMs! })),
  );
  const memoryRanks = buildMetricRankMap(
    batch.results
      .filter((result) => result.status === "SCORED" && result.peakMemoryKb != null)
      .map((result) => ({ modelId: result.modelId, value: result.peakMemoryKb! })),
  );

  return {
    batchId: batch.id,
    questionSummary: batch.question,
    questionCount: 1,
    createdAt: batch.createdAt.toISOString(),
    completedAt: toIsoString(batch.completedAt),
    judgeCompletedAt: toIsoString(batch.judgeCompletedAt),
    entries: sortBatchEntries(batch.results.map((result) => {
      const qualityAverage = pointsForRank(qualityByModel.get(result.modelId) ?? null);
      const timeAverage = pointsForRank(timeRanks.get(result.modelId) ?? null);
      const memoryAverage = pointsForRank(memoryRanks.get(result.modelId) ?? null);
      return {
        modelId: result.modelId,
        modelName: result.model.name,
        username: result.model.user.username,
        status: result.status,
        questionCount: 1,
        successfulQuestions: result.status === "SCORED" ? 1 : 0,
        averageDurationMs: result.durationMs,
        averagePeakMemoryKb: result.peakMemoryKb,
        qualityAverage,
        timeAverage,
        memoryAverage,
        totalScore: weightedTotalScore(qualityAverage, timeAverage, memoryAverage),
      };
    })),
  };
}

export async function buildModelLeaderboardData(batches: RankingBatchSource[]): Promise<ModelLeaderboardData> {
  const batchEntries = await Promise.all(batches.map(async (batch) => {
    const snapshot = await readLeaderboardSnapshot(batch.id);
    if (snapshot && "version" in snapshot && snapshot.version === 2) return snapshotToBatch(snapshot);
    if (snapshot && "version" in snapshot && snapshot.version === 1) return legacySnapshotToBatch(snapshot);
    return buildLegacyLeaderboardBatch(batch);
  }));

  const totals = new Map<string, LeaderboardTotalEntry>();
  for (const batch of batchEntries) {
    for (const entry of batch.entries) {
      const current = totals.get(entry.modelId) ?? {
        modelId: entry.modelId,
        modelName: entry.modelName,
        username: entry.username,
        appearances: 0,
        qualityTotal: 0,
        timeTotal: 0,
        memoryTotal: 0,
        totalScore: 0,
        details: [],
      };
      current.appearances += 1;
      current.qualityTotal += entry.qualityAverage;
      current.timeTotal += entry.timeAverage;
      current.memoryTotal += entry.memoryAverage;
      current.totalScore += entry.totalScore;
      current.details.push({
        ...entry,
        batchId: batch.batchId,
        questionSummary: batch.questionSummary,
        createdAt: batch.createdAt,
        completedAt: batch.completedAt,
      });
      totals.set(entry.modelId, current);
    }
  }

  return {
    batches: batchEntries.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    totals: sortTotalEntries([...totals.values()].map((entry) => ({
      ...entry,
      qualityTotal: entry.qualityTotal / Math.max(entry.appearances, 1),
      timeTotal: entry.timeTotal / Math.max(entry.appearances, 1),
      memoryTotal: entry.memoryTotal / Math.max(entry.appearances, 1),
      totalScore: entry.totalScore / Math.max(entry.appearances, 1),
      details: [...entry.details].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.totalScore - left.totalScore),
    }))),
  };
}

function createAnonymousIdentity(index: number): AnonymousModelIdentity {
  const label = index + 1;
  return {
    modelId: `anonymous-model-${label}`,
    modelName: "***",
    username: "***",
  };
}

function isCurrentUserEntry(entry: LeaderboardIdentityFields, currentUsername: string | null | undefined) {
  return Boolean(currentUsername && (entry.username === currentUsername || entry.modelId === currentUsername));
}

function isPublicLeaderboardEntry(entry: LeaderboardIdentityFields) {
  return publicLeaderboardModelIds.has(entry.modelId) || publicLeaderboardUsernames.has(entry.username);
}

function anonymizeEntry<Entry extends LeaderboardIdentityFields>(
  entry: Entry,
  identity: AnonymousModelIdentity,
  currentUsername?: string | null,
): Entry {
  const isCurrentUser = isCurrentUserEntry(entry, currentUsername);
  if (isCurrentUser || isPublicLeaderboardEntry(entry)) return { ...entry, isCurrentUser };
  return {
    ...entry,
    modelId: identity.modelId,
    modelName: identity.modelName,
    username: identity.username,
    isCurrentUser: false,
  };
}

export function anonymizeModelLeaderboardData(data: ModelLeaderboardData, currentUsername?: string | null): ModelLeaderboardData {
  const identities = new Map<string, AnonymousModelIdentity>();
  const identityFor = (modelId: string) => {
    const existing = identities.get(modelId);
    if (existing) return existing;
    const identity = createAnonymousIdentity(identities.size);
    identities.set(modelId, identity);
    return identity;
  };

  for (const total of data.totals) identityFor(total.modelId);
  for (const batch of data.batches) {
    for (const entry of batch.entries) identityFor(entry.modelId);
  }

  return {
    batches: data.batches.map((batch) => ({
      ...batch,
      entries: batch.entries.map((entry) => anonymizeEntry(entry, identityFor(entry.modelId), currentUsername)),
    })),
    totals: data.totals.map((entry) => {
      const identity = identityFor(entry.modelId);
      return {
        ...anonymizeEntry(entry, identity, currentUsername),
        details: entry.details.map((detail) => anonymizeEntry(detail, identityFor(detail.modelId), currentUsername)),
      };
    }),
  };
}

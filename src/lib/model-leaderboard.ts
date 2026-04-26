import { readFile } from "node:fs/promises";
import { modelRankingPaths, type JudgeQuestionReport, type JudgeRanking } from "@/lib/model-ranking";
import type { ModelQuestion, ModelQuestionResult } from "@/lib/model-runner";

const qualityRankPoints = [10, 7, 6, 5, 4, 3, 2, 1] as const;
const efficiencyRankPoints = [5, 4, 3, 2, 1] as const;
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
    group: {
      name: string;
    } | null;
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
  groupName: string | null;
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
  groupName: string | null;
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
  groupName: string | null;
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
  groupName: string | null;
};

type LeaderboardIdentityFields = {
  modelId: string;
  modelName: string;
  username: string;
  groupName: string | null;
  isCurrentUser?: boolean;
};

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
    groupName: string | null;
    status: string;
    questionResults: ModelQuestionResult[];
  }>;
};

function pointsForRank(rank: number | null | undefined, rankPoints: readonly number[]) {
  return rank && rank >= 1 && rank <= rankPoints.length ? rankPoints[rank - 1] : 0;
}

function weightedTotalScore(qualityScore: number, timeScore: number, memoryScore: number) {
  return qualityScore * qualityWeight + timeScore * timeWeight + memoryScore * memoryWeight;
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
      const qualityScore = pointsForRank(qualityRank, qualityRankPoints);
      const timeScore = pointsForRank(timeRank, efficiencyRankPoints);
      const memoryScore = pointsForRank(memoryRank, efficiencyRankPoints);
      return {
        modelId: result.modelId,
        modelName: result.modelName,
        username: result.username,
        groupName: result.groupName,
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
    const qualityAverage = modelQuestionEntries.reduce((sum, item) => sum + item.qualityScore, 0) / Math.max(questionCount, 1);
    const timeAverage = modelQuestionEntries.reduce((sum, item) => sum + item.timeScore, 0) / Math.max(questionCount, 1);
    const memoryAverage = modelQuestionEntries.reduce((sum, item) => sum + item.memoryScore, 0) / Math.max(questionCount, 1);
    const status = successfulQuestionCount >= questionCount ? "SCORED" : successfulQuestionCount > 0 ? "PARTIAL" : result.status;
    return {
      modelId: result.modelId,
      modelName: result.modelName,
      username: result.username,
      groupName: result.groupName,
      status,
      questionCount,
      successfulQuestions: successfulQuestionCount,
      averageDurationMs,
      averagePeakMemoryKb,
      qualityAverage,
      timeAverage,
      memoryAverage,
      totalScore: weightedTotalScore(qualityAverage, timeAverage, memoryAverage),
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
  return {
    ...snapshot,
    questions: snapshot.questions.map((question) => ({
      ...question,
      entries: sortQuestionEntries(question.entries.map((entry) => ({
        ...entry,
        groupName: entry.groupName ?? null,
        totalScore: weightedTotalScore(entry.qualityScore, entry.timeScore, entry.memoryScore),
      }))),
    })),
    entries: sortBatchEntries(snapshot.entries.map((entry) => ({
      ...entry,
      groupName: entry.groupName ?? null,
      totalScore: weightedTotalScore(entry.qualityAverage, entry.timeAverage, entry.memoryAverage),
    }))),
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
      groupName: null,
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
      const qualityAverage = pointsForRank(qualityByModel.get(result.modelId) ?? null, qualityRankPoints);
      const timeAverage = pointsForRank(timeRanks.get(result.modelId) ?? null, efficiencyRankPoints);
      const memoryAverage = pointsForRank(memoryRanks.get(result.modelId) ?? null, efficiencyRankPoints);
      return {
        modelId: result.modelId,
        modelName: result.model.name,
        username: result.model.user.username,
        groupName: result.model.group?.name ?? null,
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
  const identityByModelId = new Map<string, { groupName: string | null }>();
  for (const batch of batches) {
    for (const result of batch.results) {
      if (!identityByModelId.has(result.modelId)) identityByModelId.set(result.modelId, { groupName: result.model.group?.name ?? null });
    }
  }

  const batchEntries = (await Promise.all(batches.map(async (batch) => {
    const snapshot = await readLeaderboardSnapshot(batch.id);
    if (snapshot && "version" in snapshot && snapshot.version === 2) return snapshotToBatch(snapshot);
    if (snapshot && "version" in snapshot && snapshot.version === 1) return legacySnapshotToBatch(snapshot);
    return buildLegacyLeaderboardBatch(batch);
  }))).map((batch) => ({
    ...batch,
    entries: batch.entries.map((entry) => ({
      ...entry,
      groupName: entry.groupName ?? identityByModelId.get(entry.modelId)?.groupName ?? null,
    })),
  }));

  const totals = new Map<string, LeaderboardTotalEntry>();
  for (const batch of batchEntries) {
    for (const entry of batch.entries) {
      const current = totals.get(entry.modelId) ?? {
        modelId: entry.modelId,
        modelName: entry.modelName,
        username: entry.username,
        groupName: entry.groupName,
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
    groupName: "***",
  };
}

function isCurrentUserEntry(entry: LeaderboardIdentityFields, currentUsername: string | null | undefined) {
  return Boolean(currentUsername && (entry.username === currentUsername || entry.modelId === currentUsername));
}

function anonymizeEntry<Entry extends LeaderboardIdentityFields>(
  entry: Entry,
  identity: AnonymousModelIdentity,
  currentUsername?: string | null,
): Entry {
  if (isCurrentUserEntry(entry, currentUsername)) return { ...entry, isCurrentUser: true };
  return {
    ...entry,
    modelId: identity.modelId,
    modelName: identity.modelName,
    username: identity.username,
    groupName: identity.groupName,
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

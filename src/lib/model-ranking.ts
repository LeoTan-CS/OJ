import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { readModelQuestions, type ModelQuestion } from "@/lib/model-runner";

export const modelRankingQuestionSourceLabel = "data/model-benchmark/questions.json";
export const modelRankingQuestionsPath = join(/*turbopackIgnore: true*/ process.cwd(), "data", "model-benchmark", "questions.json");

function getModelRankingsRoot() {
  return join(/*turbopackIgnore: true*/ process.cwd(), "uploads", "model-rankings");
}

export type JudgeRanking = {
  rank: number;
  modelId: string;
  modelName: string;
  reason: string;
  score?: number;
  averageScore?: number;
};

export type JudgeQuestionReport = {
  questionId: string;
  question: string;
  rankings: JudgeRanking[];
  summaryReport: string;
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: string[];
  answerCount?: number;
  failuresCount?: number;
};

export type JudgeBatchReport = {
  version: 2;
  questionSource: string;
  questionCount: number;
  summaryReport: string;
  questions: JudgeQuestionReport[];
};

export type RankingJudgeAnswer = {
  modelId: string;
  modelName: string;
  username: string;
  answer: string;
  status: string;
  error: string | null;
  durationMs: number | null;
  peakMemoryKb: number | null;
};

export type RankingJudgeFailure = {
  modelId: string;
  modelName: string;
  username: string;
  status: string;
  error: string | null;
};

export type RankingJudgeQuestionInput = {
  questionId: string;
  question: string;
  answers: RankingJudgeAnswer[];
  failures: RankingJudgeFailure[];
};

export type RankingJudgeBatchInput = {
  batchId: string;
  questionSource: string;
  questionCount: number;
  questions: RankingJudgeQuestionInput[];
};

type ChatCompletionResponse = {
  choices?: { message?: { content?: string } }[];
};

const quietEnvLog = {
  info() {},
  error(...args: unknown[]) {
    console.error(...args);
  },
};

function reloadJudgeEnvConfig() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", quietEnvLog, true);
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function judgeChatCompletionsUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

function isLocalOllamaUrl(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) && url.port === "11434";
  } catch {
    return false;
  }
}

function shouldSendOllamaOptions(baseUrl: string) {
  const provider = optionalEnv("JUDGE_API_PROVIDER")?.toLowerCase();
  if (provider) return provider === "ollama";
  return isLocalOllamaUrl(baseUrl);
}

function readJudgeOllamaKeepAlive(baseUrl: string) {
  if (!shouldSendOllamaOptions(baseUrl)) return undefined;
  const value = optionalEnv("JUDGE_OLLAMA_KEEP_ALIVE");
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) && String(numeric) === value ? numeric : value;
}

export function assertJudgeConfig() {
  reloadJudgeEnvConfig();
  requireEnv("JUDGE_API_BASE_URL");
  requireEnv("JUDGE_API_KEY");
  requireEnv("JUDGE_MODEL");
}

export async function readDefaultModelRankingQuestions() {
  return readModelQuestions(await readFile(modelRankingQuestionsPath, "utf8"));
}

export function summarizeRankingQuestions(questions: ModelQuestion[]) {
  return `${modelRankingQuestionSourceLabel} · ${questions.length} 题`;
}

export function modelRankingPaths(batchId: string) {
  const root = join(getModelRankingsRoot(), batchId);
  return {
    root,
    questionPath: join(root, "question.json"),
    judgeInputPath: join(root, "judge-input.json"),
    leaderboardSnapshotPath: join(root, "leaderboard-snapshot.json"),
  };
}

export async function writeRankingQuestion(batchId: string, questions: ModelQuestion[]) {
  const paths = modelRankingPaths(batchId);
  await mkdir(paths.root, { recursive: true });
  await writeFile(paths.questionPath, JSON.stringify({ questions }, null, 2));
  return resolve(paths.questionPath);
}

export async function writeJudgeInput(batchId: string, input: RankingJudgeBatchInput) {
  const paths = modelRankingPaths(batchId);
  await mkdir(paths.root, { recursive: true });
  await writeFile(paths.judgeInputPath, JSON.stringify(input, null, 2));
  return resolve(paths.judgeInputPath);
}

export async function writeLeaderboardSnapshot(batchId: string, snapshot: unknown) {
  const paths = modelRankingPaths(batchId);
  await mkdir(paths.root, { recursive: true });
  await writeFile(paths.leaderboardSnapshotPath, JSON.stringify(snapshot, null, 2));
  return resolve(paths.leaderboardSnapshotPath);
}

export async function clearRankingJudgeArtifacts(batchId: string) {
  const paths = modelRankingPaths(batchId);
  await Promise.all([
    rm(paths.judgeInputPath, { force: true }).catch(() => undefined),
    rm(paths.leaderboardSnapshotPath, { force: true }).catch(() => undefined),
  ]);
}

function extractFirstJsonValue(text: string) {
  const candidate = text.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    // Fall through and scan for the first complete JSON object or array.
  }

  for (let start = 0; start < candidate.length; start += 1) {
    const first = candidate[start];
    if (first !== "{" && first !== "[") continue;
    const stack = [first];
    let inString = false;
    let escaped = false;
    for (let index = start + 1; index < candidate.length; index += 1) {
      const char = candidate[index];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === "\"") inString = false;
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }
      if (char === "{" || char === "[") {
        stack.push(char);
        continue;
      }
      if (char === "}" || char === "]") {
        const expected = char === "}" ? "{" : "[";
        if (stack[stack.length - 1] !== expected) break;
        stack.pop();
        if (stack.length === 0) {
          return JSON.parse(candidate.slice(start, index + 1));
        }
      }
    }
  }

  throw new Error("裁判模型未返回有效 JSON");
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? text).trim();
  const parsed = extractFirstJsonValue(candidate);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("裁判模型未返回有效 JSON");
  return parsed;
}

function normalizeJudgeReport(value: unknown, questionMeta: Pick<RankingJudgeQuestionInput, "questionId" | "question">): JudgeQuestionReport {
  if (!value || typeof value !== "object") throw new Error("裁判结果必须是 JSON 对象");
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.rankings)) throw new Error("裁判结果缺少 rankings 数组");
  const rankings = record.rankings.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error("rankings 项必须是对象");
    const row = item as Record<string, unknown>;
    const modelId = String(row.modelId ?? "");
    const modelName = String(row.modelName ?? "");
    const reason = String(row.reason ?? "");
    if (!modelId || !modelName || !reason) throw new Error("rankings 项缺少 modelId/modelName/reason");
    const score = row.score == null ? undefined : Number(row.score);
    return {
      rank: Number(row.rank ?? index + 1),
      modelId,
      modelName,
      reason,
      score: Number.isFinite(score) ? score : undefined,
    };
  });
  return {
    questionId: questionMeta.questionId,
    question: questionMeta.question,
    rankings,
    summaryReport: String(record.summaryReport ?? ""),
    strengths: Array.isArray(record.strengths) ? record.strengths.map(String) : [],
    weaknesses: Array.isArray(record.weaknesses) ? record.weaknesses.map(String) : [],
    recommendations: Array.isArray(record.recommendations) ? record.recommendations.map(String) : [],
  };
}

export function createEmptyJudgeReport(input: RankingJudgeQuestionInput): JudgeQuestionReport {
  return {
    questionId: input.questionId,
    question: input.question,
    rankings: [],
    summaryReport: "本题没有任何可评估输出，无法进行质量排序。",
    strengths: [],
    weaknesses: ["所有参与模型在本题都没有产生可供裁判评估的输出。"],
    recommendations: ["请检查模型运行稳定性，以及在本题上的输出是否被正确写出。"],
    answerCount: 0,
    failuresCount: input.failures.length,
  };
}

export async function judgeModelRanking(input: RankingJudgeQuestionInput, options: { unloadAfterResponse?: boolean } = {}) {
  reloadJudgeEnvConfig();
  const baseUrl = requireEnv("JUDGE_API_BASE_URL").replace(/\/+$/, "");
  const apiKey = requireEnv("JUDGE_API_KEY");
  const model = requireEnv("JUDGE_MODEL");
  const ollamaKeepAlive = options.unloadAfterResponse && shouldSendOllamaOptions(baseUrl) ? 0 : readJudgeOllamaKeepAlive(baseUrl);
  const prompt = [
    "你是一个严格、公正的大模型回答质量裁判。请根据准确性、完整性、结构清晰度、事实可靠性和中文表达质量排序。",
    "只要 answers 中有输出文本，该模型就必须参与质量排名。",
    "请忽略输出被截断、超时、中断、长度不足等因素带来的形式问题，只基于已经给出的回答内容本身进行比较。",
    "不要因为模型状态不是 SCORED 就排除它；如果 answers 里有文本，就必须纳入排名。",
    "failures 仅表示完全没有可评估输出的模型，它们不参与排名，但可以在报告中说明。",
    "只输出质量排名，不要输出分数。",
    "必须只返回严格 JSON，不要 Markdown，不要代码块。JSON 结构：",
    '{"rankings":[{"rank":1,"modelId":"","modelName":"","reason":""}],"summaryReport":"","strengths":[""],"weaknesses":[""],"recommendations":[""]}',
    "评测输入如下：",
    JSON.stringify(input, null, 2),
  ].join("\n");
  const requestBody: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  };
  if (ollamaKeepAlive !== undefined) requestBody.keep_alive = ollamaKeepAlive;
  const endpoint = judgeChatCompletionsUrl(baseUrl);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? error.cause : null;
    const detail = cause && typeof cause === "object" && "message" in cause
      ? String(cause.message)
      : error instanceof Error
        ? error.message
        : "网络请求失败";
    throw new Error(`裁判模型连接失败: ${detail}`);
  }
  const bodyText = await response.text();
  if (!response.ok) {
    const bodyPreview = bodyText.trim().slice(0, 600);
    throw new Error(`裁判模型调用失败: HTTP ${response.status}${bodyPreview ? ` - ${bodyPreview}` : ""}`);
  }
  const body = extractJsonObject(bodyText) as ChatCompletionResponse;
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("裁判模型响应缺少 content");
  const report = normalizeJudgeReport(extractJsonObject(content), input);
  report.answerCount = input.answers.length;
  report.failuresCount = input.failures.length;
  return { rawResponse: bodyText, report };
}

export async function readJudgeInput(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as RankingJudgeBatchInput;
}

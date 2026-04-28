import { execFile, spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

export type ModelRunStatus = "SCORED" | "INVALID_OUTPUT" | "TIME_LIMIT_EXCEEDED" | "RUNTIME_ERROR";

export type ModelRunResult = {
  status: ModelRunStatus;
  stdout: string;
  stderr: string;
  durationMs: number;
  peakMemoryKb?: number;
  outputText?: string;
  error?: string;
};

export type ModelQuestion = { id: string; question: string };
export type ModelQuestionResult = {
  id: string;
  question: string;
  status: ModelRunStatus;
  answer?: string | null;
  error?: string | null;
  durationMs?: number | null;
  peakMemoryKb?: number | null;
};

export function formatModelTimeoutMessage(timeoutMs: number) {
  return `模型测试超过 ${Math.ceil(timeoutMs / 1000)} 秒，已终止任务`;
}

export const modelTimeoutMessage = formatModelTimeoutMessage(300_000);
const outputLimit = 4000;
const memorySampleIntervalMs = 200;

function remainingMs(deadline: number) {
  return Math.max(0, deadline - Date.now());
}

function timeoutResult(started: number, timeoutMs: number, stdout = "", stderr = ""): ModelRunResult {
  const trimmedStdout = stdout.trim();
  const trimmedStderr = stderr.trim();
  const timeoutMessage = formatModelTimeoutMessage(timeoutMs);
  const message = trimmedStderr || timeoutMessage;
  return {
    status: "TIME_LIMIT_EXCEEDED",
    stdout,
    stderr: message,
    error: trimmedStdout ? `${timeoutMessage}（已保留部分输出）` : timeoutMessage,
    durationMs: Date.now() - started,
  };
}

function maxKnownNumber(...values: Array<number | null | undefined>) {
  const known = values.filter((value): value is number => value != null && Number.isFinite(value));
  return known.length ? Math.max(...known) : undefined;
}

function parseRssKb(output: string) {
  const value = Number(output.trim().split(/\s+/)[0]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function startPeakMemoryMonitor(pid: number | undefined) {
  let peakMemoryKb: number | undefined;
  let stopped = false;
  let inFlight = false;

  const sample = () => {
    if (!pid || stopped || inFlight) return;
    inFlight = true;
    execFile("ps", ["-o", "rss=", "-p", String(pid)], { timeout: 1000 }, (_error, stdout) => {
      inFlight = false;
      const rssKb = parseRssKb(stdout);
      peakMemoryKb = maxKnownNumber(peakMemoryKb, rssKb);
    });
  };

  sample();
  const timer = setInterval(sample, memorySampleIntervalMs);
  timer.unref?.();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
      return peakMemoryKb;
    },
  };
}

function buildQuestionTimeout(question: ModelQuestion, timeoutMs: number): ModelQuestionResult {
  return { id: question.id, question: question.question, status: "TIME_LIMIT_EXCEEDED", error: formatModelTimeoutMessage(timeoutMs), durationMs: null, peakMemoryKb: null };
}

function normalizePromptQuestionResult(question: ModelQuestion, result: ModelRunResult): ModelQuestionResult {
  if (result.status !== "SCORED") return normalizeQuestionFailure(question, result);

  const answer = result.stdout.trim();
  if (!answer) {
    return {
      id: question.id,
      question: question.question,
      status: "INVALID_OUTPUT",
      answer: null,
      error: (result.stderr.trim() || "模型没有向 stdout 输出回答").slice(0, outputLimit),
      durationMs: result.durationMs,
      peakMemoryKb: result.peakMemoryKb ?? null,
    };
  }

  return {
    id: question.id,
    question: question.question,
    status: "SCORED",
    answer,
    error: result.stderr.trim() || null,
    durationMs: result.durationMs,
    peakMemoryKb: result.peakMemoryKb ?? null,
  };
}

function deriveRunStatus(questionResults: ModelQuestionResult[]): ModelRunStatus {
  if (questionResults.every((item) => item.status === "SCORED")) return "SCORED";
  return questionResults.find((item) => item.status === "TIME_LIMIT_EXCEEDED")?.status
    ?? questionResults.find((item) => item.status === "RUNTIME_ERROR")?.status
    ?? "INVALID_OUTPUT";
}

function normalizeQuestionFailure(question: ModelQuestion, result: ModelRunResult): ModelQuestionResult {
  const answer = result.stdout.trim();
  return {
    id: question.id,
    question: question.question,
    status: result.status,
    answer: answer || null,
    error: (result.error || result.stderr || result.stdout || result.status).slice(0, outputLimit),
    durationMs: result.durationMs,
    peakMemoryKb: result.peakMemoryKb ?? null,
  };
}

async function runPromptPython({
  entrypointPath,
  question,
  workingDir,
  deadline,
  started,
}: {
  entrypointPath: string;
  question: string;
  workingDir: string;
  deadline: number;
  started: number;
}) {
  return runPython([entrypointPath, question], workingDir, deadline, started);
}

async function runSingleQuestionWithPrompt({
  entrypointPath,
  workingDir,
  question,
  timeoutMs,
}: {
  entrypointPath: string;
  workingDir: string;
  question: ModelQuestion;
  timeoutMs: number;
}): Promise<ModelQuestionResult> {
  const started = Date.now();
  const deadline = started + timeoutMs;
  if (remainingMs(deadline) <= 0) return buildQuestionTimeout(question, timeoutMs);

  const prompt = await runPromptPython({
    entrypointPath,
    question: question.question,
    workingDir,
    deadline,
    started,
  });
  return normalizePromptQuestionResult(question, prompt);
}

function runPython(args: string[], cwd: string, deadline: number, started: number): Promise<ModelRunResult> {
  const limitMs = Math.max(0, deadline - started);
  const timeoutMs = remainingMs(deadline);
  if (timeoutMs <= 0) return Promise.resolve(timeoutResult(started, limitMs));
  return new Promise((resolve) => {
    const runStartedAt = Date.now();
    const child = spawn("python3", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: process.env.PYTORCH_ENABLE_MPS_FALLBACK ?? "1" },
    });
    const memoryMonitor = startPeakMemoryMonitor(child.pid);
    let settled = false;
    let stdout = "";
    let stderr = "";
    const finish = (result: ModelRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const peakMemoryKb = memoryMonitor.stop();
      resolve({ ...result, peakMemoryKb: maxKnownNumber(peakMemoryKb, result.peakMemoryKb) });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-outputLimit); });
    child.on("close", (code, signal) => {
      if (signal === "SIGKILL") return finish(timeoutResult(runStartedAt, limitMs, stdout, stderr));
      const durationMs = Date.now() - runStartedAt;
      if (code === 0) return finish({ status: "SCORED", stdout, stderr, durationMs });
      return finish({ status: "RUNTIME_ERROR", stdout, stderr, error: (stderr || stdout || "RUNTIME_ERROR").slice(0, outputLimit), durationMs });
    });
    child.on("error", (err) => {
      finish({ status: "RUNTIME_ERROR", stdout, stderr: (stderr || err.message).slice(-outputLimit), error: (stderr || err.message).slice(0, outputLimit), durationMs: Date.now() - runStartedAt });
    });
  });
}

export function readModelQuestionResults(text: string): ModelQuestionResult[] {
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : parsed.answers;
  if (!Array.isArray(rows)) throw new Error("Model output must be an array or { answers: [...] }");
  return rows.map((item, index) => {
    if (typeof item === "string") return { id: String(index + 1), question: "", status: "SCORED" as const, answer: item.trim(), durationMs: null, peakMemoryKb: null };
    if (!item || typeof item !== "object") throw new Error("Each answer row must be a string or object");
    const record = item as Record<string, unknown>;
    const statusValue = String(record.status ?? "SCORED");
    const status: ModelRunStatus = statusValue === "TIME_LIMIT_EXCEEDED" || statusValue === "RUNTIME_ERROR" || statusValue === "INVALID_OUTPUT" || statusValue === "SCORED"
      ? statusValue
      : "INVALID_OUTPUT";
    const answer = record.answer ?? record.output ?? record.response ?? record.text;
    const durationMs = record.durationMs == null ? null : Number(record.durationMs);
    const peakMemoryKb = record.peakMemoryKb == null ? null : Number(record.peakMemoryKb);
    return {
      id: String(record.id ?? index + 1),
      question: String(record.question ?? ""),
      status,
      answer: answer == null ? null : String(answer),
      error: record.error == null ? null : String(record.error),
      durationMs: Number.isFinite(durationMs) ? durationMs : null,
      peakMemoryKb: Number.isFinite(peakMemoryKb) ? peakMemoryKb : null,
    };
  });
}

export function readModelQuestions(text: string): ModelQuestion[] {
  const parsed = JSON.parse(text);
  const questions = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(questions) || questions.length === 0) throw new Error("Model questions must be a non-empty array or { questions: [...] }");
  return questions.map((item, index) => {
    if (typeof item === "string") return { id: String(index + 1), question: item };
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const question = record.question ?? record.prompt ?? record.input;
      if (question != null) return { id: String(record.id ?? index + 1), question: String(question) };
    }
    throw new Error("Each model question must be a string or object with question/prompt/input");
  });
}

export async function runModelQuestionsIndividually({
  entrypointPath,
  workingDir,
  outputPath,
  questions,
  timeoutMs,
}: {
  entrypointPath: string;
  workingDir: string;
  outputPath: string;
  questions: ModelQuestion[];
  timeoutMs: number;
}): Promise<ModelRunResult> {
  const started = Date.now();
  const answers: ModelQuestionResult[] = [];
  let peakMemoryKb: number | undefined;
  for (const question of questions) {
    const result = await runSingleQuestionWithPrompt({
      entrypointPath,
      workingDir,
      question,
      timeoutMs,
    });
    answers.push(result);
    peakMemoryKb = maxKnownNumber(peakMemoryKb, result.peakMemoryKb);
  }
  const outputText = JSON.stringify({ answers }, null, 2);
  await writeFile(outputPath, outputText);
  return {
    status: deriveRunStatus(answers),
    stdout: outputText,
    stderr: "",
    durationMs: Date.now() - started,
    peakMemoryKb,
    outputText,
  };
}

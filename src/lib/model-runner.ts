import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve as resolvePath, sep } from "node:path";

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
const singularityWorkspacePath = "/workspace";
const singularityTmpPath = "/tmp";
const defaultSingularityCommand = "singularity";

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

type ProcessStatus = { ppid: number; rssKb: number };

function parseProcessStatus(text: string): ProcessStatus | null {
  const ppid = Number(text.match(/^PPid:\s+(\d+)/m)?.[1]);
  if (!Number.isFinite(ppid)) return null;
  const rssKb = Number(text.match(/^VmRSS:\s+(\d+)\s+kB/m)?.[1]);
  return { ppid, rssKb: Number.isFinite(rssKb) && rssKb > 0 ? rssKb : 0 };
}

async function readProcessSnapshot() {
  const entries = await readdir("/proc", { withFileTypes: true });
  const rows = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map(async (entry) => {
      try {
        const status = parseProcessStatus(await readFile(join("/proc", entry.name, "status"), "utf8"));
        return status ? [Number(entry.name), status] as const : null;
      } catch {
        return null;
      }
    }));
  return new Map(rows.filter((row): row is readonly [number, ProcessStatus] => Boolean(row)));
}

async function readProcessTreeRssKb(rootPid: number) {
  const snapshot = await readProcessSnapshot();
  if (!snapshot.has(rootPid)) return undefined;

  const children = new Map<number, number[]>();
  for (const [pid, status] of snapshot) {
    const siblings = children.get(status.ppid);
    if (siblings) siblings.push(pid);
    else children.set(status.ppid, [pid]);
  }

  const seen = new Set<number>();
  const stack = [rootPid];
  let totalRssKb = 0;
  while (stack.length) {
    const pid = stack.pop()!;
    if (seen.has(pid)) continue;
    seen.add(pid);
    const status = snapshot.get(pid);
    if (!status) continue;
    totalRssKb += status.rssKb;
    stack.push(...(children.get(pid) ?? []));
  }

  return totalRssKb > 0 ? totalRssKb : undefined;
}

function startPeakMemoryMonitor(pid: number | undefined) {
  let peakMemoryKb: number | undefined;
  let stopped = false;
  let inFlight = false;

  const sample = () => {
    if (!pid || stopped || inFlight) return;
    inFlight = true;
    readProcessTreeRssKb(pid)
      .then((rssKb) => {
        if (!stopped) peakMemoryKb = maxKnownNumber(peakMemoryKb, rssKb);
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
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
  return runPython(entrypointPath, [question], workingDir, deadline, started);
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

function containerEntrypointPath(entrypointPath: string, cwd: string) {
  const resolvedCwd = resolvePath(cwd);
  const resolvedEntrypoint = resolvePath(entrypointPath);
  const relativeEntrypoint = relative(resolvedCwd, resolvedEntrypoint);
  if (!relativeEntrypoint || relativeEntrypoint.startsWith("..") || isAbsolute(relativeEntrypoint)) {
    throw new Error("模型入口文件必须位于模型包目录内");
  }
  return {
    hostWorkspacePath: resolvedCwd,
    containerPath: relativeEntrypoint.split(sep).join("/"),
  };
}

type SingularityConfig = {
  command: string;
  imagePath: string;
  scratchRoot: string;
  enableNv: boolean;
  readonlyBinds: string[];
};

function runtimeErrorResult(started: number, message: string, stdout = "", stderr = message): ModelRunResult {
  return {
    status: "RUNTIME_ERROR",
    stdout,
    stderr: stderr.slice(-outputLimit),
    error: message.slice(0, outputLimit),
    durationMs: Date.now() - started,
  };
}

function envFlagEnabled(value: string | undefined, fallback: boolean) {
  if (value == null || !value.trim()) return fallback;
  return !/^(0|false|no|off)$/i.test(value.trim());
}

function requireAbsolutePath(value: string, name: string) {
  if (!isAbsolute(value)) throw new Error(`${name} 必须使用绝对路径`);
  return value;
}

function normalizeReadonlyBind(bind: string) {
  const parts = bind.split(":").map((part) => part.trim());
  if (parts.length < 2 || parts.some((part) => !part)) {
    throw new Error(`MODEL_SINGULARITY_READONLY_BINDS 包含无效绑定: ${bind}`);
  }
  const mode = parts[parts.length - 1];
  const hasMode = mode === "ro" || mode === "rw";
  const hostPath = parts[0];
  const containerPath = parts[1];
  requireAbsolutePath(hostPath, "MODEL_SINGULARITY_READONLY_BINDS 的宿主路径");
  requireAbsolutePath(containerPath, "MODEL_SINGULARITY_READONLY_BINDS 的容器路径");
  if (mode === "rw") throw new Error("MODEL_SINGULARITY_READONLY_BINDS 只允许只读绑定，不能包含 :rw");
  return hasMode ? parts.join(":") : `${parts.join(":")}:ro`;
}

function parseReadonlyBinds(value: string | undefined) {
  if (!value?.trim()) return [];
  return value.split(",").map((bind) => normalizeReadonlyBind(bind.trim())).filter(Boolean);
}

async function readSingularityConfig(): Promise<SingularityConfig> {
  const imagePath = process.env.MODEL_SINGULARITY_IMAGE?.trim();
  if (!imagePath) {
    throw new Error("缺少环境变量 MODEL_SINGULARITY_IMAGE，请设置为 Singularity .sif 镜像的绝对路径。");
  }
  requireAbsolutePath(imagePath, "MODEL_SINGULARITY_IMAGE");
  try {
    await access(imagePath);
  } catch {
    throw new Error(`Singularity 镜像不存在或不可读取: ${imagePath}`);
  }

  const scratchRoot = requireAbsolutePath(process.env.MODEL_SINGULARITY_SCRATCH_ROOT?.trim() || "/tmp", "MODEL_SINGULARITY_SCRATCH_ROOT");
  try {
    await mkdir(scratchRoot, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法创建临时目录";
    throw new Error(`无法准备 Singularity 临时目录 ${scratchRoot}: ${message}`);
  }

  return {
    command: process.env.MODEL_SINGULARITY_COMMAND?.trim() || defaultSingularityCommand,
    imagePath,
    scratchRoot,
    enableNv: envFlagEnabled(process.env.MODEL_SINGULARITY_ENABLE_NV, true),
    readonlyBinds: parseReadonlyBinds(process.env.MODEL_SINGULARITY_READONLY_BINDS),
  };
}

function buildSingularityEnv() {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTORCH_ENABLE_MPS_FALLBACK: process.env.PYTORCH_ENABLE_MPS_FALLBACK ?? "1",
  };
  const containerEnv = {
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
    HF_DATASETS_OFFLINE: "1",
    TOKENIZERS_PARALLELISM: "false",
    HOME: singularityTmpPath,
    TMPDIR: singularityTmpPath,
    PYTORCH_ENABLE_MPS_FALLBACK: env.PYTORCH_ENABLE_MPS_FALLBACK ?? "1",
  };
  for (const [key, value] of Object.entries(containerEnv)) {
    env[`SINGULARITYENV_${key}`] = value;
    env[`APPTAINERENV_${key}`] = value;
  }
  return env;
}

function buildSingularityArgs({
  config,
  paths,
  scratchDir,
  args,
}: {
  config: SingularityConfig;
  paths: ReturnType<typeof containerEntrypointPath>;
  scratchDir: string;
  args: string[];
}) {
  const singularityArgs = ["exec"];
  if (config.enableNv) singularityArgs.push("--nv");
  singularityArgs.push(
    "--containall",
    "--cleanenv",
    "--no-home",
    "--net",
    "--network", "none",
    "--pwd", singularityWorkspacePath,
    "-B", `${paths.hostWorkspacePath}:${singularityWorkspacePath}:ro`,
    "-B", `${scratchDir}:${singularityTmpPath}:rw`,
  );
  for (const bind of config.readonlyBinds) singularityArgs.push("-B", bind);
  singularityArgs.push(
    config.imagePath,
    "python3",
    `${singularityWorkspacePath}/${paths.containerPath}`,
    ...args,
  );
  return singularityArgs;
}

function formatSingularityRuntimeError(stderr: string, stdout: string, config: SingularityConfig) {
  const detail = (stderr || stdout || "RUNTIME_ERROR").trim();
  if (/could not open image|failed to open.*image|image.*not found|no such file.*\.sif/i.test(detail)) {
    return `Singularity 镜像不存在或无法打开: ${config.imagePath}。请检查 MODEL_SINGULARITY_IMAGE。原始错误：${detail}`;
  }
  if (/cni|netns|network namespace|setup.*network|setting up.*network|network.*requires|--net/i.test(detail)) {
    return `Singularity 网络隔离失败，请确认当前环境允许使用 --net --network none。原始错误：${detail}`;
  }
  if (/python3.*not found|python3: command not found|exec.*python3.*no such file/i.test(detail)) {
    return "Singularity 镜像缺少 python3，请重新构建包含 Python、CUDA/PyTorch/Transformers 依赖的 .sif 镜像。";
  }
  return detail || "Singularity 模型运行失败";
}

function formatSingularitySpawnError(error: Error, command: string) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") {
    return `Singularity 命令不可用: ${command}。请安装 singularity，或通过 MODEL_SINGULARITY_COMMAND 指定可执行文件。`;
  }
  return error.message;
}

function killProcessGroup(pid: number | undefined) {
  if (!pid) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process may have already exited.
    }
  }
}

function runSingularityProcess({
  config,
  paths,
  scratchDir,
  args,
  timeoutMs,
  limitMs,
}: {
  config: SingularityConfig;
  paths: ReturnType<typeof containerEntrypointPath>;
  scratchDir: string;
  args: string[];
  timeoutMs: number;
  limitMs: number;
}): Promise<ModelRunResult> {
  return new Promise((resolve) => {
    const runStartedAt = Date.now();
    const child = spawn(config.command, buildSingularityArgs({ config, paths, scratchDir, args }), {
      detached: true,
      env: buildSingularityEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const memoryMonitor = startPeakMemoryMonitor(child.pid);
    let settled = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";
    let timeoutFallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: ModelRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (timeoutFallbackTimer) clearTimeout(timeoutFallbackTimer);
      const peakMemoryKb = memoryMonitor.stop();
      resolve({ ...result, peakMemoryKb: maxKnownNumber(peakMemoryKb, result.peakMemoryKb) });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid);
      timeoutFallbackTimer = setTimeout(() => {
        finish(timeoutResult(runStartedAt, limitMs, stdout, stderr));
      }, 5000);
      timeoutFallbackTimer.unref?.();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-outputLimit); });
    child.on("close", (code) => {
      if (timedOut) return finish(timeoutResult(runStartedAt, limitMs, stdout, stderr));
      const durationMs = Date.now() - runStartedAt;
      if (code === 0) return finish({ status: "SCORED", stdout, stderr, durationMs });
      return finish({
        status: "RUNTIME_ERROR",
        stdout,
        stderr,
        error: formatSingularityRuntimeError(stderr, stdout, config).slice(0, outputLimit),
        durationMs,
      });
    });
    child.on("error", (err) => {
      const message = formatSingularitySpawnError(err, config.command);
      finish(runtimeErrorResult(runStartedAt, message, stdout, stderr || message));
    });
  });
}

async function runPython(entrypointPath: string, args: string[], cwd: string, deadline: number, started: number): Promise<ModelRunResult> {
  const limitMs = Math.max(0, deadline - started);
  const timeoutMs = remainingMs(deadline);
  if (timeoutMs <= 0) return Promise.resolve(timeoutResult(started, limitMs));
  let paths: ReturnType<typeof containerEntrypointPath>;
  try {
    paths = containerEntrypointPath(entrypointPath, cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : "模型入口路径无效";
    return Promise.resolve({ status: "RUNTIME_ERROR", stdout: "", stderr: message, error: message, durationMs: Date.now() - started });
  }
  let scratchDir: string | null = null;
  try {
    const config = await readSingularityConfig();
    scratchDir = await mkdtemp(join(config.scratchRoot, "bench-model-"));
    return await runSingularityProcess({ config, paths, scratchDir, args, timeoutMs, limitMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Singularity 模型运行失败";
    return runtimeErrorResult(started, message);
  } finally {
    if (scratchDir) await rm(scratchDir, { recursive: true, force: true }).catch(() => undefined);
  }
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

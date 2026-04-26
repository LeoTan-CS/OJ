import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modelTimeoutMessage, readModelQuestionResults, runModelQuestionsIndividually, type ModelRunStatus } from "@/lib/model-runner";

export const modelConnectivityPrompt = "介绍一下你自己";
export const modelConnectivityTimeoutMs = 60_000;

const outputLimit = 4000;

export type ModelConnectivityResult = {
  status: ModelRunStatus;
  answer: string | null;
  error: string | null;
  durationMs: number | null;
  peakMemoryKb: number | null;
};

function errorMessage(status: ModelRunStatus, fallback?: string | null) {
  if (fallback?.trim()) return fallback.trim().slice(0, outputLimit);
  return status === "TIME_LIMIT_EXCEEDED" ? modelTimeoutMessage : status;
}

export async function runModelConnectivityTest({
  entrypointPath,
  workingDir,
  prompt = modelConnectivityPrompt,
  timeoutMs = modelConnectivityTimeoutMs,
}: {
  entrypointPath: string;
  workingDir: string;
  prompt?: string;
  timeoutMs?: number;
}): Promise<ModelConnectivityResult> {
  const runDir = await mkdtemp(join(tmpdir(), "bench-model-connectivity-"));
  const outputPath = join(runDir, "answers.json");
  const question = { id: "connectivity", question: prompt };

  try {
    const result = await runModelQuestionsIndividually({
      entrypointPath,
      workingDir,
      outputPath,
      questions: [question],
      timeoutMs,
    });

    const questionResult = readModelQuestionResults(result.outputText ?? result.stdout)[0];
    if (!questionResult || questionResult.status !== "SCORED") {
      const status = questionResult?.status ?? "INVALID_OUTPUT";
      return {
        status,
        answer: questionResult?.answer ?? null,
        error: errorMessage(status, questionResult?.error ?? result.error ?? result.stderr ?? "测试未返回有效回答"),
        durationMs: questionResult?.durationMs ?? result.durationMs,
        peakMemoryKb: questionResult?.peakMemoryKb ?? result.peakMemoryKb ?? null,
      };
    }

    return {
      status: "SCORED",
      answer: questionResult.answer ?? "",
      error: questionResult.error ?? null,
      durationMs: questionResult.durationMs ?? result.durationMs,
      peakMemoryKb: questionResult.peakMemoryKb ?? result.peakMemoryKb ?? null,
    };
  } catch (error) {
    return {
      status: "INVALID_OUTPUT",
      answer: null,
      error: error instanceof Error ? error.message.slice(0, outputLimit) : "模型测试失败",
      durationMs: null,
      peakMemoryKb: null,
    };
  } finally {
    await rm(runDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

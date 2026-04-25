import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireUser } from "@/lib/auth";
import { handle, json, error } from "@/lib/http";
import { getSyncedModelUploadIds } from "@/lib/model-sync";
import { modelRuntimeLimitMs } from "@/lib/model-upload";
import { modelTimeoutMessage, readModelQuestionResults, runModelWithFallback } from "@/lib/model-runner";
import { prisma } from "@/lib/prisma";

const prompt = "简单介绍一下自己";
const outputLimit = 4000;

export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    if (user.role !== "USER") return error("只有普通用户可以测试自己的模型", 400);
    const uploadIds = await getSyncedModelUploadIds();
    if (!uploadIds.includes(user.username)) return error("请先上传模型", 400);
    const model = await prisma.modelArtifact.findUnique({ where: { userId: user.id } });
    if (!model) return error("请先上传模型", 400);

    const runDir = await mkdtemp(join(tmpdir(), "bench-model-test-"));
    const inputPath = join(runDir, "questions.json");
    const outputPath = join(runDir, "answers.json");
    try {
      await writeFile(inputPath, JSON.stringify({ questions: [{ id: "self-intro", question: prompt }] }, null, 2));
      const result = await runModelWithFallback({ entrypointPath: model.entrypointPath, workingDir: model.packageDir, inputPath, outputPath, questions: [{ id: "self-intro", question: prompt }], timeoutMs: modelRuntimeLimitMs });
      if (result.status !== "SCORED") {
        return json({ status: result.status, error: (result.error || result.stderr || result.stdout || (result.status === "TIME_LIMIT_EXCEEDED" ? modelTimeoutMessage : result.status)).slice(0, outputLimit), durationMs: result.durationMs });
      }
      const questionResult = readModelQuestionResults(result.outputText ?? result.stdout)[0];
      if (!questionResult || questionResult.status !== "SCORED") {
        return json({ status: questionResult?.status ?? "INVALID_OUTPUT", error: questionResult?.error ?? "测试失败", durationMs: questionResult?.durationMs ?? result.durationMs });
      }
      const answer = questionResult.answer ?? parseAnswer(result.outputText ?? result.stdout);
      return json({ status: result.status, answer, durationMs: result.durationMs });
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });
}

function parseAnswer(text: string) {
  try {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed.answers;
    if (Array.isArray(rows) && rows.length > 0) {
      const first = rows[0];
      if (typeof first === "string") return first;
      if (first && typeof first === "object") {
        const record = first as Record<string, unknown>;
        return String(record.answer ?? record.output ?? record.prediction ?? JSON.stringify(record));
      }
    }
  } catch {
    return text.trim();
  }
  return text.trim();
}

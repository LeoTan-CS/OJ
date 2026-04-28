import { rm } from "node:fs/promises";
import { requireAdmin } from "@/lib/auth";
import { error, handle, json } from "@/lib/http";
import { clearRankingJudgeArtifacts } from "@/lib/model-ranking";
import { modelRunPaths } from "@/lib/model-upload";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; modelId: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id, modelId } = await params;
    const batch = await prisma.modelTestBatch.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        status: true,
        judgeStatus: true,
        results: { where: { modelId }, select: { id: true } },
      },
    });
    if (!batch || batch.kind !== "RANKING") return error("排名批次不存在", 404);
    if (batch.status === "RUNNING" || batch.judgeStatus === "PENDING" || batch.judgeStatus === "RUNNING") {
      return error("当前批次正在执行，暂时不能重跑单个模型", 400);
    }

    const targetResult = batch.results[0];
    if (!targetResult) return error("该模型不在当前排名批次中", 404);

    await Promise.all([
      rm(modelRunPaths(modelId, id).runDir, { recursive: true, force: true }),
      clearRankingJudgeArtifacts(id),
    ]);
    await prisma.$transaction([
      prisma.modelTestResult.update({
        where: { id: targetResult.id },
        data: {
          status: "PENDING",
          durationMs: null,
          peakMemoryKb: null,
          outputPath: null,
          outputPreview: null,
          error: null,
          startedAt: null,
          completedAt: null,
        },
      }),
      prisma.modelTestBatch.update({
        where: { id },
        data: {
          status: "PENDING",
          startedAt: null,
          completedAt: null,
          judgeStatus: "WAITING",
          judgeInputPath: null,
          judgeRawResponse: null,
          judgeRankingsJson: null,
          judgeReport: null,
          judgeError: null,
          judgeStartedAt: null,
          judgeCompletedAt: null,
        },
      }),
    ]);
    return json({ ok: true });
  });
}

import { requireAdmin } from "@/lib/auth";
import { error, handle, json } from "@/lib/http";
import { assertJudgeConfig, clearRankingJudgeArtifacts } from "@/lib/model-ranking";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    try {
      assertJudgeConfig();
    } catch (err) {
      return error(err instanceof Error ? err.message : "裁判配置不完整", 400);
    }
    const { id } = await params;
    const batch = await prisma.modelTestBatch.findUnique({
      where: { id },
      select: { id: true, kind: true, status: true, judgeStatus: true },
    });
    if (!batch || batch.kind !== "RANKING") return error("排名批次不存在", 404);
    if (batch.status !== "COMPLETED") return error("模型测试尚未完成，不能开始裁判排名", 400);
    if (batch.judgeStatus === "PENDING" || batch.judgeStatus === "RUNNING") return error("裁判排名已在队列中", 400);

    await clearRankingJudgeArtifacts(id);
    await prisma.modelTestBatch.update({
      where: { id },
      data: {
        judgeStatus: "PENDING",
        judgeInputPath: null,
        judgeRawResponse: null,
        judgeRankingsJson: null,
        judgeReport: null,
        judgeError: null,
        judgeStartedAt: null,
        judgeCompletedAt: null,
      },
    });
    return json({ ok: true });
  });
}

import { requireAdmin } from "@/lib/auth";
import { error, handle, json } from "@/lib/http";
import { getSyncedModelUploadIds } from "@/lib/model-sync";
import { readDefaultModelRankingQuestions, summarizeRankingQuestions, writeRankingQuestion } from "@/lib/model-ranking";
import { prisma } from "@/lib/prisma";
import { publicUserSelect } from "@/lib/user-select";

async function nextRankingBatchId() {
  const dateId = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }).replaceAll("-", "");
  const prefix = `${dateId}-rank`;
  const existing = await prisma.modelTestBatch.findMany({ where: { id: { startsWith: prefix } }, select: { id: true } });
  if (!existing.some((batch) => batch.id === prefix)) return prefix;
  const suffixes = existing.map((batch) => Number(batch.id.match(new RegExp(`^${prefix}-(\\d+)$`))?.[1] ?? 1)).filter((value) => Number.isFinite(value));
  return `${prefix}-${Math.max(...suffixes, 1) + 1}`;
}

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const uploadIds = await getSyncedModelUploadIds();
    const questions = await readDefaultModelRankingQuestions();
    const [models, batches] = await Promise.all([
      prisma.modelArtifact.findMany({ where: { id: { in: uploadIds } }, include: { user: { select: publicUserSelect }, group: true }, orderBy: { createdAt: "desc" } }),
      prisma.modelTestBatch.findMany({ where: { kind: "RANKING" }, include: { createdBy: { select: publicUserSelect }, results: { where: { modelId: { in: uploadIds } }, include: { model: { include: { user: { select: publicUserSelect }, group: true } } }, orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    return json({ questionSummary: summarizeRankingQuestions(questions), questionCount: questions.length, models, batches });
  });
}

export async function POST() {
  return handle(async () => {
    const admin = await requireAdmin();
    const uploadIds = await getSyncedModelUploadIds();
    const models = await prisma.modelArtifact.findMany({ where: { id: { in: uploadIds }, enabled: true }, select: { id: true } });
    if (models.length === 0) return error("没有启用的模型可排名", 400);
    const questions = await readDefaultModelRankingQuestions();
    if (questions.length === 0) return error("模型排名题库为空", 400);
    const id = await nextRankingBatchId();
    const questionSummary = summarizeRankingQuestions(questions);
    await writeRankingQuestion(id, questions);
    const batch = await prisma.modelTestBatch.create({
      data: {
        id,
        kind: "RANKING",
        question: questionSummary,
        createdById: admin.id,
        status: "PENDING",
        judgeStatus: "WAITING",
        results: { create: models.map((model) => ({ modelId: model.id })) },
      },
      include: { results: true },
    });
    return json({ batch });
  });
}

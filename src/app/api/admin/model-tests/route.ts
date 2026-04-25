import { requireAdmin } from "@/lib/auth";
import { handle, json, error } from "@/lib/http";
import { getSyncedModelUploadIds } from "@/lib/model-sync";
import { modelQuestionsPath } from "@/lib/model-upload";
import { prisma } from "@/lib/prisma";
import { publicUserSelect } from "@/lib/user-select";
import { access } from "node:fs/promises";

async function nextBatchId() {
  const dateId = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }).replaceAll("-", "");
  const existing = await prisma.modelTestBatch.findMany({ where: { id: { startsWith: dateId } }, select: { id: true } });
  if (!existing.some((batch) => batch.id === dateId)) return dateId;
  const suffixes = existing.map((batch) => Number(batch.id.match(new RegExp(`^${dateId}-(\\d+)$`))?.[1] ?? 1)).filter((value) => Number.isFinite(value));
  return `${dateId}-${Math.max(...suffixes, 1) + 1}`;
}

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const uploadIds = await getSyncedModelUploadIds();
    const [models, batches] = await Promise.all([
      prisma.modelArtifact.findMany({ where: { id: { in: uploadIds } }, include: { user: { select: publicUserSelect }, group: true, results: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } }),
      prisma.modelTestBatch.findMany({ include: { createdBy: { select: publicUserSelect }, results: { where: { modelId: { in: uploadIds } }, include: { model: { include: { user: { select: publicUserSelect }, group: true } } }, orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);
    return json({ models, batches });
  });
}

export async function POST() {
  return handle(async () => {
    const admin = await requireAdmin();
    await access(modelQuestionsPath).catch(() => { throw new Response(JSON.stringify({ error: `测试集不存在: ${modelQuestionsPath}` }), { status: 400 }); });
    const uploadIds = await getSyncedModelUploadIds();
    const models = await prisma.modelArtifact.findMany({ where: { id: { in: uploadIds }, enabled: true }, select: { id: true } });
    if (models.length === 0) return error("没有启用的模型可测试", 400);
    const batch = await prisma.modelTestBatch.create({
      data: {
        id: await nextBatchId(),
        createdById: admin.id,
        status: "PENDING",
        results: { create: models.map((model) => ({ modelId: model.id })) },
      },
      include: { results: true },
    });
    return json({ batch });
  });
}

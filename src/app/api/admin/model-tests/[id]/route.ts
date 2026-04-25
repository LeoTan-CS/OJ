import { rm } from "node:fs/promises";
import { requireAdmin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { modelRankingPaths } from "@/lib/model-ranking";
import { modelRunPaths } from "@/lib/model-upload";
import { prisma } from "@/lib/prisma";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const batch = await prisma.modelTestBatch.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        results: { select: { modelId: true } },
      },
    });
    if (!batch) return json({ ok: true });

    const cleanupPaths = new Set(batch.results.map((result) => modelRunPaths(result.modelId, id).runDir));
    if (batch.kind === "RANKING") cleanupPaths.add(modelRankingPaths(id).root);

    await Promise.all([...cleanupPaths].map((path) => rm(path, { recursive: true, force: true })));
    await prisma.modelTestBatch.delete({ where: { id } });
    return json({ ok: true });
  });
}

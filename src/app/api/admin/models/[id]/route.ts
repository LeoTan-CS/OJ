import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { handle, json, parseJson } from "@/lib/http";
import { removeModelUpload } from "@/lib/model-upload";
import { prisma } from "@/lib/prisma";

const updateModelSchema = z.object({ enabled: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const body = await parseJson(request, updateModelSchema);
    const model = await prisma.modelArtifact.update({ where: { id }, data: { enabled: body.enabled } });
    return json({ model });
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    await prisma.modelArtifact.delete({ where: { id } });
    await removeModelUpload(id).catch(() => undefined);
    return json({ ok: true });
  });
}

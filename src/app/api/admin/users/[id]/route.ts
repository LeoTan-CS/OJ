import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { canManageRole, requireAdmin } from "@/lib/auth";
import { handle, json, parseJson, error } from "@/lib/http";
import { renameUserModelIdentity } from "@/lib/model-management";
import { removeModelUpload } from "@/lib/model-upload";
import { prisma } from "@/lib/prisma";
import { publicUserSelect } from "@/lib/user-select";
import { userSchema } from "@/lib/validators";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireAdmin();
    const { id } = await params;
    const target = await prisma.user.findUniqueOrThrow({ where: { id } });
    const body = await parseJson(request, userSchema);
    if (!canManageRole(actor.role, target.role as "SUPER_ADMIN" | "ADMIN" | "USER") || !canManageRole(actor.role, body.role)) return error("Forbidden", 403);
    const existing = await prisma.user.findUnique({ where: { username: body.username }, select: { id: true } });
    if (existing && existing.id !== id) return error("账号已存在", 400);
    let modelIdentityChanged = false;
    try {
      modelIdentityChanged = Boolean(await renameUserModelIdentity({ userId: id, newUsername: body.username }));
      const data = {
        username: body.username,
        role: body.role,
        enabled: true,
        ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 10) } : {}),
      };
      const user = await prisma.user.update({ where: { id }, data, select: publicUserSelect });
      return json({ user });
    } catch (err) {
      if (modelIdentityChanged) await renameUserModelIdentity({ userId: id, newUsername: target.username }).catch(() => undefined);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return error("账号已存在", 400);
      if (err instanceof Error) return error(err.message, 400);
      throw err;
    }
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireAdmin();
    const { id } = await params;
    const target = await prisma.user.findUniqueOrThrow({ where: { id } });
    if (!canManageRole(actor.role, target.role as "SUPER_ADMIN" | "ADMIN" | "USER")) return error("Forbidden", 403);
    const models = await prisma.modelArtifact.findMany({ where: { userId: id }, select: { id: true } });
    await prisma.user.delete({ where: { id } });
    await Promise.all(models.map((model) => removeModelUpload(model.id).catch(() => undefined)));
    return json({ ok: true });
  });
}

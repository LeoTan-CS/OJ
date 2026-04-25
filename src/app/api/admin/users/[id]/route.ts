import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { canManageRole, requireAdmin } from "@/lib/auth";
import { handle, json, parseJson, error } from "@/lib/http";
import { renameUserModelIdentity } from "@/lib/model-management";
import { removeModelUpload } from "@/lib/model-upload";
import { prisma } from "@/lib/prisma";
import { publicUserWithGroupSelect } from "@/lib/user-select";
import { userSchema } from "@/lib/validators";

async function resolveUserGroupId(role: "SUPER_ADMIN" | "ADMIN" | "USER", groupId: string | undefined) {
  if (role !== "USER") return null;
  if (!groupId) return null;
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new Response(JSON.stringify({ error: "小组不存在" }), { status: 400 });
  return group.id;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireAdmin();
    const { id } = await params;
    const target = await prisma.user.findUniqueOrThrow({ where: { id } });
    const body = await parseJson(request, userSchema);
    if (!canManageRole(actor.role, target.role as "SUPER_ADMIN" | "ADMIN" | "USER") || !canManageRole(actor.role, body.role)) return error("Forbidden", 403);
    const existing = await prisma.user.findUnique({ where: { username: body.username }, select: { id: true } });
    if (existing && existing.id !== id) return error("用户名已存在", 400);
    const groupId = await resolveUserGroupId(body.role, body.groupId);
    let modelIdentityChanged = false;
    try {
      modelIdentityChanged = Boolean(await renameUserModelIdentity({ userId: id, newUsername: body.username, groupId }));
      const data = {
        username: body.username,
        nickname: body.username,
        role: body.role,
        groupId,
        enabled: true,
        ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 10) } : {}),
      };
      const user = await prisma.user.update({ where: { id }, data, select: publicUserWithGroupSelect });
      return json({ user });
    } catch (err) {
      if (modelIdentityChanged) await renameUserModelIdentity({ userId: id, newUsername: target.username, groupId: target.groupId }).catch(() => undefined);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return error("用户名已存在", 400);
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

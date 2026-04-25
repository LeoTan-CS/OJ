import bcrypt from "bcryptjs";
import { canManageRole, requireAdmin } from "@/lib/auth";
import { handle, json, parseJson, error } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { userSchema } from "@/lib/validators";

async function resolveUserGroupId(role: "SUPER_ADMIN" | "ADMIN" | "USER", groupId: string | undefined) {
  if (role !== "USER") return null;
  if (!groupId) throw new Response(JSON.stringify({ error: "普通用户必须选择小组" }), { status: 400 });
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
    const groupId = await resolveUserGroupId(body.role, body.groupId);
    const data = {
      username: body.username,
      nickname: body.username,
      role: body.role,
      groupId,
      enabled: true,
      ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 10) } : {}),
    };
    return json({ user: await prisma.user.update({ where: { id }, data, include: { group: true } }) });
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireAdmin();
    const { id } = await params;
    const target = await prisma.user.findUniqueOrThrow({ where: { id } });
    if (!canManageRole(actor.role, target.role as "SUPER_ADMIN" | "ADMIN" | "USER")) return error("Forbidden", 403);
    const replacement = target.groupId ? await prisma.user.findFirst({ where: { groupId: target.groupId, id: { not: id } }, select: { id: true } }) : null;
    const modelCount = await prisma.modelArtifact.count({ where: { userId: id } });
    if (modelCount > 0 && !replacement) return error("该用户是小组模型的最近上传人，请先让同组其他用户上传模型或删除模型后再删除用户", 400);
    if (replacement) await prisma.modelArtifact.updateMany({ where: { userId: id }, data: { userId: replacement.id } });
    await prisma.user.delete({ where: { id } });
    return json({ ok: true });
  });
}

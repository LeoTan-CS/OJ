import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { error, handle, json, parseJson } from "@/lib/http";
import { renameUserModelIdentity } from "@/lib/model-management";
import { prisma } from "@/lib/prisma";
import { accountProfileSchema } from "@/lib/validators";

export async function PATCH(request: Request) {
  return handle(async () => {
    const session = await requireUser();
    const body = await parseJson(request, accountProfileSchema);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) return error("当前密码不正确", 400);
    if (body.username === user.username) return json({ user: { id: user.id, username: user.username } });

    const existing = await prisma.user.findUnique({ where: { username: body.username }, select: { id: true } });
    if (existing && existing.id !== user.id) return error("用户名已存在", 400);

    let modelIdentityChanged = false;
    try {
      modelIdentityChanged = Boolean(await renameUserModelIdentity({ userId: user.id, newUsername: body.username, groupId: user.groupId }));
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { username: body.username, nickname: body.username },
        select: { id: true, username: true },
      });
      return json({ user: updated });
    } catch (err) {
      if (modelIdentityChanged) await renameUserModelIdentity({ userId: user.id, newUsername: user.username, groupId: user.groupId }).catch(() => undefined);
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return error("用户名已存在", 400);
      if (err instanceof Error) return error(err.message, 400);
      throw err;
    }
  });
}

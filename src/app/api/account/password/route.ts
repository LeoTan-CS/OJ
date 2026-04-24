import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/auth";
import { handle, json, parseJson, error } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { passwordSchema } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireUser();
    const body = await parseJson(request, passwordSchema);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) return error("Current password is incorrect", 400);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 10) } });
    return json({ ok: true });
  });
}

import bcrypt from "bcryptjs";
import { canManageRole, requireAdmin } from "@/lib/auth";
import { error, handle, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const actor = await requireAdmin();
    const { id } = await params;
    const target = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, username: true, role: true },
    });

    if (!canManageRole(actor.role, target.role as "SUPER_ADMIN" | "ADMIN" | "USER")) {
      return error("Forbidden", 403);
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: await bcrypt.hash(target.username, 10) },
    });

    return json({ ok: true });
  });
}

import { requireUser } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const announcements = await prisma.announcement.findMany({
      where: { OR: [{ classId: null }, { classId: user.classId }] },
      include: { class: true },
      orderBy: { createdAt: "desc" },
    });
    return json({ announcements });
  });
}

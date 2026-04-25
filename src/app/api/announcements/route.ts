import { requireUser } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  return handle(async () => {
    await requireUser();
    const announcements = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" } });
    return json({ announcements });
  });
}

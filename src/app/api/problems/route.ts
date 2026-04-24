import { requireUser } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const competitions = await prisma.competition.findMany({ where: { enabled: true, assignments: { some: { classId: user.classId ?? "" } } }, orderBy: { createdAt: "desc" } });
    return json({ competitions });
  });
}

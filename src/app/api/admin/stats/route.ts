import { requireAdmin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const [users, classes, competitions, submissions, scored] = await Promise.all([prisma.user.count(), prisma.class.count(), prisma.competition.count(), prisma.submission.count(), prisma.submission.count({ where: { status: "SCORED" } })]);
    const recent = await prisma.submission.findMany({ select: { createdAt: true, status: true }, orderBy: { createdAt: "desc" }, take: 30 });
    return json({ users, classes, competitions, submissions, scoreRate: submissions ? Math.round((scored / submissions) * 100) : 0, recent });
  });
}

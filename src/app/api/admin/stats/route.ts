import { requireAdmin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() { return handle(async () => { await requireAdmin(); const [users, classes, problems, submissions, accepted] = await Promise.all([prisma.user.count(), prisma.class.count(), prisma.problem.count(), prisma.submission.count(), prisma.submission.count({ where: { status: "ACCEPTED" } })]); const recent = await prisma.submission.findMany({ select: { createdAt: true, status: true }, orderBy: { createdAt: "desc" }, take: 30 }); return json({ users, classes, problems, submissions, passRate: submissions ? Math.round((accepted / submissions) * 100) : 0, recent }); }); }

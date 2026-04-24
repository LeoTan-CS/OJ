import { requireUser } from "@/lib/auth";
import { handle, json, parseJson, error } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { submitSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJson(request, submitSchema);
    const competition = await prisma.competition.findFirst({ where: { id, enabled: true, ...(user.role === "USER" ? { assignments: { some: { classId: user.classId ?? "" } } } : {}) } });
    if (!competition) return error("Competition not found", 404);
    const submission = await prisma.submission.create({ data: { userId: user.id, competitionId: id, code: body.code } });
    return json({ submissionId: submission.id });
  });
}

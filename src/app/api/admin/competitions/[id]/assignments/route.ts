import { requireAdmin } from "@/lib/auth";
import { handle, json, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assignmentSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const body = await parseJson(request, assignmentSchema);
    await prisma.competitionAssignment.deleteMany({ where: { competitionId: id } });
    await prisma.competitionAssignment.createMany({ data: body.classIds.map((classId) => ({ competitionId: id, classId })) });
    return json({ ok: true });
  });
}

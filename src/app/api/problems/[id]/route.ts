import { requireUser } from "@/lib/auth";
import { handle, json, error } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const competition = await prisma.competition.findFirst({ where: { id, enabled: true, assignments: { some: { classId: user.classId ?? "" } } } });
    if (!competition) return error("Competition not found", 404);
    return json({ competition });
  });
}

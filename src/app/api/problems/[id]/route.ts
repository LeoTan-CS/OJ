import { requireUser } from "@/lib/auth";
import { handle, json, error } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const problem = await prisma.problem.findFirst({
      where: { id, ...(user.role === "USER" ? { enabled: true, assignments: { some: { classId: user.classId ?? "" } } } : {}) },
      include: { testCases: { where: { isSample: true }, orderBy: { sortOrder: "asc" } } },
    });
    if (!problem) return error("Problem not found", 404);
    return json({ problem });
  });
}

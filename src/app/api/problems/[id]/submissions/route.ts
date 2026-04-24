import { requireUser } from "@/lib/auth";
import { handle, json, parseJson, error } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { submitSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJson(request, submitSchema);
    const problem = await prisma.problem.findFirst({ where: { id, enabled: true, assignments: { some: { classId: user.classId ?? "" } } } });
    if (!problem && user.role === "USER") return error("Problem not found", 404);
    const submission = await prisma.submission.create({ data: { userId: user.id, problemId: id, code: body.code } });
    return json({ submissionId: submission.id });
  });
}

import { requireUser } from "@/lib/auth";
import { handle, json, error } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const submission = await prisma.submission.findFirst({
      where: { id, ...(user.role === "USER" ? { userId: user.id } : {}) },
      include: { user: true, problem: true, caseResults: { include: { testCase: true }, orderBy: { testCase: { sortOrder: "asc" } } } },
    });
    if (!submission) return error("Submission not found", 404);
    const visibleResults = user.role === "USER" ? submission.caseResults.filter((result) => result.testCase.isSample) : submission.caseResults;
    return json({ submission: { ...submission, caseResults: visibleResults } });
  });
}

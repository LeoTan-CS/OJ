import { requireUser } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const problems = await prisma.problem.findMany({
      where: user.role === "USER" ? { enabled: true, assignments: { some: { classId: user.classId ?? "" } } } : {},
      include: { submissions: { where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
    return json({ problems });
  });
}

import { requireAdmin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const submissions = await prisma.submission.findMany({ include: { user: true, competition: true }, orderBy: { createdAt: "desc" }, take: 100 });
    return json({ submissions });
  });
}

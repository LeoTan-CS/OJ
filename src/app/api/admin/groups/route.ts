import { requireAdmin } from "@/lib/auth";
import { error, handle, json, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { groupSchema } from "@/lib/validators";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const groups = await prisma.group.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { users: true, models: true } } } });
    return json({ groups });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = await parseJson(request, groupSchema);
    const existing = await prisma.group.findUnique({ where: { name: body.name } });
    if (existing) return error("小组名已存在", 400);
    const group = await prisma.group.create({ data: { name: body.name } });
    return json({ group });
  });
}

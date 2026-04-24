import { requireAdmin } from "@/lib/auth";
import { handle, json, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { competitionSchema } from "@/lib/validators";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return json({ competitions: await prisma.competition.findMany({ include: { assignments: { include: { class: true } } }, orderBy: { createdAt: "desc" } }), classes: await prisma.class.findMany() });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const body = await parseJson(request, competitionSchema);
    const competition = await prisma.competition.create({ data: body });
    return json({ competition });
  });
}

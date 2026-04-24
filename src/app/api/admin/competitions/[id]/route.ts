import { requireAdmin } from "@/lib/auth";
import { handle, json, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { competitionSchema } from "@/lib/validators";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    return json({ competition: await prisma.competition.findUniqueOrThrow({ where: { id }, include: { assignments: true } }), classes: await prisma.class.findMany() });
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const body = await parseJson(request, competitionSchema);
    const competition = await prisma.competition.update({ where: { id }, data: body });
    return json({ competition });
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    await prisma.competition.delete({ where: { id } });
    return json({ ok: true });
  });
}

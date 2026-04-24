import { requireAdmin } from "@/lib/auth";
import { handle, json, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { classSchema } from "@/lib/validators";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) { return handle(async () => { await requireAdmin(); const { id } = await params; const body = await parseJson(request, classSchema); return json({ class: await prisma.class.update({ where: { id }, data: body }) }); }); }
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) { return handle(async () => { await requireAdmin(); const { id } = await params; await prisma.class.delete({ where: { id } }); return json({ ok: true }); }); }

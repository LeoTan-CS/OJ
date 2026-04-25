import { requireAdmin } from "@/lib/auth";
import { handle, json, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { announcementSchema } from "@/lib/validators";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) { return handle(async () => { await requireAdmin(); const { id } = await params; const body = await parseJson(request, announcementSchema); return json({ announcement: await prisma.announcement.update({ where: { id }, data: { title: body.title, body: body.body } }) }); }); }
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) { return handle(async () => { await requireAdmin(); const { id } = await params; await prisma.announcement.delete({ where: { id } }); return json({ ok: true }); }); }

import { requireAdmin } from "@/lib/auth";
import { handle, json, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { announcementSchema } from "@/lib/validators";

export async function GET() { return handle(async () => { await requireAdmin(); return json({ announcements: await prisma.announcement.findMany({ include: { class: true }, orderBy: { createdAt: "desc" } }), classes: await prisma.class.findMany() }); }); }
export async function POST(request: Request) { return handle(async () => { await requireAdmin(); const body = await parseJson(request, announcementSchema); return json({ announcement: await prisma.announcement.create({ data: { title: body.title, body: body.body, classId: body.classId ?? null } }) }); }); }

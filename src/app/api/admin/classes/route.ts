import { requireAdmin } from "@/lib/auth";
import { handle, json, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { classSchema } from "@/lib/validators";

export async function GET() { return handle(async () => { await requireAdmin(); return json({ classes: await prisma.class.findMany({ orderBy: { createdAt: "desc" } }) }); }); }
export async function POST(request: Request) { return handle(async () => { await requireAdmin(); const body = await parseJson(request, classSchema); return json({ class: await prisma.class.create({ data: body }) }); }); }

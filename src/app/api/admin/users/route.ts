import bcrypt from "bcryptjs";
import { canManageRole, requireAdmin } from "@/lib/auth";
import { handle, json, parseJson, error } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { userSchema } from "@/lib/validators";

export async function GET() { return handle(async () => { await requireAdmin(); return json({ users: await prisma.user.findMany({ include: { class: true }, orderBy: { createdAt: "desc" } }), classes: await prisma.class.findMany() }); }); }
export async function POST(request: Request) { return handle(async () => { const actor = await requireAdmin(); const body = await parseJson(request, userSchema); if (!canManageRole(actor.role, body.role)) return error("Forbidden", 403); if (!body.password) return error("Password is required", 400); const user = await prisma.user.create({ data: { username: body.username, nickname: body.nickname, role: body.role, enabled: body.enabled, classId: body.classId ?? null, passwordHash: await bcrypt.hash(body.password, 10) } }); return json({ user }); }); }

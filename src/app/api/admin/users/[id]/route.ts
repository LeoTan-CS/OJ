import bcrypt from "bcryptjs";
import { canManageRole, requireAdmin } from "@/lib/auth";
import { handle, json, parseJson, error } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { userSchema } from "@/lib/validators";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) { return handle(async () => { const actor = await requireAdmin(); const { id } = await params; const target = await prisma.user.findUniqueOrThrow({ where: { id } }); const body = await parseJson(request, userSchema); if (!canManageRole(actor.role, target.role as "SUPER_ADMIN" | "ADMIN" | "USER") || !canManageRole(actor.role, body.role)) return error("Forbidden", 403); const data = { username: body.username, nickname: body.nickname, role: body.role, enabled: body.enabled, classId: body.classId ?? null, ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 10) } : {}) }; return json({ user: await prisma.user.update({ where: { id }, data }) }); }); }
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) { return handle(async () => { const actor = await requireAdmin(); const { id } = await params; const target = await prisma.user.findUniqueOrThrow({ where: { id } }); if (!canManageRole(actor.role, target.role as "SUPER_ADMIN" | "ADMIN" | "USER")) return error("Forbidden", 403); await prisma.user.delete({ where: { id } }); return json({ ok: true }); }); }

import { requireAdmin } from "@/lib/auth";
import { handle, json, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { problemSchema } from "@/lib/validators";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { return handle(async () => { await requireAdmin(); const { id } = await params; return json({ problem: await prisma.problem.findUniqueOrThrow({ where: { id }, include: { testCases: { orderBy: { sortOrder: "asc" } }, assignments: true } }), classes: await prisma.class.findMany() }); }); }
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) { return handle(async () => { await requireAdmin(); const { id } = await params; const body = await parseJson(request, problemSchema); await prisma.testCase.deleteMany({ where: { problemId: id } }); const problem = await prisma.problem.update({ where: { id }, data: { title: body.title, description: body.description, functionName: body.functionName, functionSig: body.functionSig, codeTemplate: body.codeTemplate, difficulty: body.difficulty, timeLimitMs: body.timeLimitMs, enabled: body.enabled, testCases: { create: body.testCases } } }); return json({ problem }); }); }
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) { return handle(async () => { await requireAdmin(); const { id } = await params; await prisma.problem.delete({ where: { id } }); return json({ ok: true }); }); }

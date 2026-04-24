import { requireAdmin } from "@/lib/auth";
import { handle, json, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { problemSchema } from "@/lib/validators";

export async function GET() { return handle(async () => { await requireAdmin(); return json({ problems: await prisma.problem.findMany({ include: { testCases: true, assignments: { include: { class: true } } }, orderBy: { createdAt: "desc" } }), classes: await prisma.class.findMany() }); }); }
export async function POST(request: Request) { return handle(async () => { await requireAdmin(); const body = await parseJson(request, problemSchema); const problem = await prisma.problem.create({ data: { title: body.title, description: body.description, functionName: body.functionName, functionSig: body.functionSig, codeTemplate: body.codeTemplate, difficulty: body.difficulty, timeLimitMs: body.timeLimitMs, enabled: body.enabled, testCases: { create: body.testCases } } }); return json({ problem }); }); }

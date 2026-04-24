import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell";
import { Card } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import SubmitForm from "./submit-form";

export default async function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const problem = await prisma.problem.findFirst({ where: { id, enabled: true, assignments: { some: { classId: user?.classId ?? "" } } }, include: { testCases: { where: { isSample: true }, orderBy: { sortOrder: "asc" } } } });
  if (!problem) notFound();
  return <AppShell><div className="grid gap-6 lg:grid-cols-[1fr_520px]"><Card><h1 className="text-3xl font-bold">{problem.title}</h1><p className="mt-2 text-sm text-slate-500">{problem.difficulty} · 时间限制 {problem.timeLimitMs}ms</p><pre className="mt-6 whitespace-pre-wrap rounded-xl bg-slate-100 p-4 text-sm">{problem.description}</pre><h2 className="mt-6 text-xl font-bold">函数签名</h2><code className="mt-2 block rounded-xl bg-slate-950 p-4 text-sm text-white">{problem.functionSig}</code><h2 className="mt-6 text-xl font-bold">样例</h2>{problem.testCases.map((tc) => <div key={tc.id} className="mt-3 rounded-xl border p-4 text-sm"><div>args: <code>{tc.args}</code></div><div>expected: <code>{tc.expected}</code></div></div>)}</Card><Card><h2 className="text-xl font-bold">提交代码</h2><SubmitForm problemId={problem.id} template={problem.codeTemplate} /></Card></div></AppShell>;
}

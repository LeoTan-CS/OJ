import { AdminNav, AppShell } from "@/components/shell";
import { Card } from "@/components/ui";
import { AssignmentForm } from "@/components/admin-forms";
import { prisma } from "@/lib/prisma";
import ProblemEditor from "./problem-editor";

export default async function ProblemEditPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const isNew = id === "new"; const [problem, classes] = await Promise.all([isNew ? null : prisma.problem.findUnique({ where:{id}, include:{testCases:{orderBy:{sortOrder:'asc'}}, assignments:true} }), prisma.class.findMany()]); return <AppShell admin><AdminNav /><div className="grid gap-6 lg:grid-cols-[1fr_320px]"><Card><h1 className="text-xl font-bold">{isNew?'新建题目':'编辑题目'}</h1><ProblemEditor problem={problem} /></Card>{!isNew && problem && <Card><h2 className="text-xl font-bold">班级分配</h2><div className="mt-4"><AssignmentForm problemId={problem.id} classes={classes} assigned={problem.assignments.map(a=>a.classId)} /></div></Card>}</div></AppShell>; }

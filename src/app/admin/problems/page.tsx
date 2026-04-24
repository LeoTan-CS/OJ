import Link from "next/link";
import { AdminNav, AppShell } from "@/components/shell";
import { Card } from "@/components/ui";
import { DeleteButton } from "@/components/admin-forms";
import { prisma } from "@/lib/prisma";

export default async function ProblemsPage() { const problems = await prisma.problem.findMany({ include:{assignments:{include:{class:true}}, testCases:true}, orderBy:{createdAt:'desc'} }); return <AppShell admin><AdminNav /><Card><div className="flex items-center justify-between"><h1 className="text-xl font-bold">题目列表</h1><Link className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" href="/admin/problems/new">新建题目</Link></div><table className="mt-3"><tbody>{problems.map((p)=><tr key={p.id}><td><Link className="font-semibold" href={`/admin/problems/${p.id}`}>{p.title}</Link><p className="text-xs text-slate-500">{p.functionSig}</p></td><td>{p.testCases.length} 测试点</td><td>{p.assignments.map(a=>a.class.name).join(', ')||'未分配'}</td><td>{p.enabled?'启用':'禁用'}</td><td><DeleteButton endpoint={`/api/admin/problems/${p.id}`} /></td></tr>)}</tbody></table></Card></AppShell>; }

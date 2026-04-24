import { AdminNav, AppShell } from "@/components/shell";
import { Card } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  const [users, classes, problems, submissions, accepted, recent] = await Promise.all([prisma.user.count(), prisma.class.count(), prisma.problem.count(), prisma.submission.count(), prisma.submission.count({ where: { status: "ACCEPTED" } }), prisma.submission.findMany({ include: { user: true, problem: true }, orderBy: { createdAt: "desc" }, take: 8 })]);
  const stats = [{ label: "用户", value: users }, { label: "班级", value: classes }, { label: "题目", value: problems }, { label: "提交", value: submissions }, { label: "通过率", value: `${submissions ? Math.round((accepted / submissions) * 100) : 0}%` }];
  return <AppShell admin><AdminNav /><div className="grid gap-6"><div className="grid gap-4 md:grid-cols-5">{stats.map((s) => <Card key={s.label}><div className="text-sm text-slate-500">{s.label}</div><div className="mt-2 text-3xl font-bold">{s.value}</div></Card>)}</div><Card><h2 className="text-xl font-bold">近期提交</h2><table className="mt-3"><tbody>{recent.map((s) => <tr key={s.id}><td>{s.user.nickname}</td><td>{s.problem.title}</td><td>{s.status}</td><td>{s.score}%</td></tr>)}</tbody></table></Card></div></AppShell>;
}

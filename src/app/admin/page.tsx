export const dynamic = "force-dynamic";
import { AdminNav, AppShell } from "@/components/shell";
import { Card, StatusBadge } from "@/components/ui";
import { formatMetricValue } from "@/lib/judge";
import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  const [users, classes, competitions, submissions, scored, recent] = await Promise.all([
    prisma.user.count(),
    prisma.class.count(),
    prisma.competition.count(),
    prisma.submission.count(),
    prisma.submission.count({ where: { status: "SCORED" } }),
    prisma.submission.findMany({ include: { user: true, competition: true }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const stats = [{ label: "用户", value: users }, { label: "班级", value: classes }, { label: "比赛", value: competitions }, { label: "提交", value: submissions }, { label: "成功率", value: `${submissions ? Math.round((scored / submissions) * 100) : 0}%` }];
  return <AppShell admin><AdminNav /><div className="grid gap-6"><div className="grid gap-4 md:grid-cols-5">{stats.map((stat) => <Card key={stat.label}><div className="text-sm text-slate-500">{stat.label}</div><div className="mt-2 text-3xl font-bold">{stat.value}</div></Card>)}</div><Card><h2 className="text-xl font-bold">近期提交</h2><table className="mt-3"><tbody>{recent.map((submission) => <tr key={submission.id}><td>{submission.user.nickname}</td><td>{submission.competition.title}</td><td><StatusBadge status={submission.status} /></td><td>{formatMetricValue(submission.metricValue)}</td></tr>)}</tbody></table></Card></div></AppShell>;
}

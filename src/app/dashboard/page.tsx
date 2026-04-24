export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell";
import { Card, StatusBadge } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getRoleHomePath } from "@/lib/auth";
import { formatMetricName, formatMetricValue } from "@/lib/judge";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (user && user.role !== "USER") redirect(getRoleHomePath(user.role));
  const [announcements, competitions, submissions] = await Promise.all([
    prisma.announcement.findMany({ where: { OR: [{ classId: null }, { classId: user?.classId }] }, include: { class: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.competition.findMany({ where: { enabled: true, assignments: { some: { classId: user?.classId ?? "" } } }, include: { submissions: { where: { userId: user?.id }, orderBy: { leaderboardScore: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } }),
    prisma.submission.findMany({ where: { userId: user?.id }, include: { competition: true }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  return <AppShell><div className="grid gap-6 lg:grid-cols-[1fr_360px]"><section className="grid gap-6"><Card><div className="flex items-center justify-between"><h1 className="text-2xl font-bold">可参加比赛</h1><Link className="text-sm font-semibold text-slate-700" href="/competitions">查看全部</Link></div><div className="mt-4 grid gap-3">{competitions.map((competition) => <Link key={competition.id} href={`/competitions/${competition.id}`} className="rounded-xl border p-4 hover:bg-slate-50"><div className="flex items-center justify-between gap-4"><div><div className="font-semibold">{competition.title}</div><div className="text-sm text-slate-500">指标 {formatMetricName(competition.metric)} · 运行限制 {competition.runtimeLimitMs}ms</div></div>{competition.submissions[0] && <div className="text-right text-sm"><StatusBadge status={competition.submissions[0].status} /><div className="mt-1 text-slate-500">最佳 {formatMetricValue(competition.submissions[0].metricValue)}</div></div>}</div></Link>)}{!competitions.length && <p className="text-sm text-slate-500">当前班级暂无分配比赛。</p>}</div></Card><Card><h2 className="text-xl font-bold">最近提交</h2><table className="mt-3"><tbody>{submissions.map((submission) => <tr key={submission.id}><td><Link className="font-medium" href={`/submissions/${submission.id}`}>{submission.competition.title}</Link></td><td><StatusBadge status={submission.status} /></td><td>{formatMetricValue(submission.metricValue)}</td></tr>)}</tbody></table></Card></section><aside><Card><h2 className="text-xl font-bold">公告</h2><div className="mt-4 grid gap-4">{announcements.map((announcement) => <article key={announcement.id} className="border-b pb-3 last:border-0"><h3 className="font-semibold">{announcement.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{announcement.body}</p><p className="mt-2 text-xs text-slate-400">{announcement.class?.name ?? "全部"}</p></article>)}</div></Card></aside></div></AppShell>;
}

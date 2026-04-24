import Link from "next/link";
import { AppShell } from "@/components/shell";
import { Card, StatusBadge } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [announcements, problems, submissions] = await Promise.all([
    prisma.announcement.findMany({ where: { OR: [{ classId: null }, { classId: user?.classId }] }, include: { class: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.problem.findMany({ where: { enabled: true, assignments: { some: { classId: user?.classId ?? "" } } }, include: { submissions: { where: { userId: user?.id }, orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } }),
    prisma.submission.findMany({ where: { userId: user?.id }, include: { problem: true }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  return <AppShell><div className="grid gap-6 lg:grid-cols-[1fr_360px]"><section className="grid gap-6"><Card><h1 className="text-2xl font-bold">可做题目</h1><div className="mt-4 grid gap-3">{problems.map((p) => <Link key={p.id} href={`/problems/${p.id}`} className="rounded-xl border p-4 hover:bg-slate-50"><div className="flex items-center justify-between"><div><div className="font-semibold">{p.title}</div><div className="text-sm text-slate-500">{p.difficulty} · {p.functionSig}</div></div>{p.submissions[0] && <StatusBadge status={p.submissions[0].status} />}</div></Link>)}{!problems.length && <p className="text-sm text-slate-500">当前班级暂无分配题目。</p>}</div></Card><Card><h2 className="text-xl font-bold">最近提交</h2><table className="mt-3"><tbody>{submissions.map((s) => <tr key={s.id}><td><Link className="font-medium" href={`/submissions/${s.id}`}>{s.problem.title}</Link></td><td><StatusBadge status={s.status} /></td><td>{s.score}%</td></tr>)}</tbody></table></Card></section><aside><Card><h2 className="text-xl font-bold">公告</h2><div className="mt-4 grid gap-4">{announcements.map((a) => <article key={a.id} className="border-b pb-3 last:border-0"><h3 className="font-semibold">{a.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p><p className="mt-2 text-xs text-slate-400">{a.class?.name ?? "全部"}</p></article>)}</div></Card></aside></div></AppShell>;
}

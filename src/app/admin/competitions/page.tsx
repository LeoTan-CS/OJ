export const dynamic = "force-dynamic";
import Link from "next/link";
import { AdminNav, AppShell } from "@/components/shell";
import { Card } from "@/components/ui";
import { DeleteButton } from "@/components/admin-forms";
import { formatMetricName } from "@/lib/judge";
import { prisma } from "@/lib/prisma";

export default async function CompetitionsPage() {
  const competitions = await prisma.competition.findMany({ include: { assignments: { include: { class: true } }, submissions: true }, orderBy: { createdAt: "desc" } });
  return <AppShell admin><AdminNav /><Card><div className="flex items-center justify-between"><h1 className="text-xl font-bold">比赛列表</h1><Link className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" href="/admin/competitions/new">新建比赛</Link></div><table className="mt-3"><tbody>{competitions.map((competition) => <tr key={competition.id}><td><Link className="font-semibold" href={`/admin/competitions/${competition.id}`}>{competition.title}</Link><p className="text-xs text-slate-500">{formatMetricName(competition.metric)} · {competition.runtimeLimitMs}ms</p></td><td>{competition.submissions.length} 提交</td><td>{competition.assignments.map((assignment) => assignment.class.name).join(", ") || "未分配"}</td><td>{competition.enabled ? "启用" : "禁用"}</td><td><DeleteButton endpoint={`/api/admin/competitions/${competition.id}`} /></td></tr>)}</tbody></table></Card></AppShell>;
}

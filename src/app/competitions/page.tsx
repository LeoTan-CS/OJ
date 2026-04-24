export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell";
import { Card } from "@/components/ui";
import { getCurrentUser, getRoleHomePath } from "@/lib/auth";
import { formatMetricName } from "@/lib/judge";
import { prisma } from "@/lib/prisma";

export default async function CompetitionsPage() {
  const user = await getCurrentUser();
  if (user && user.role !== "USER") redirect(getRoleHomePath(user.role));
  const competitions = await prisma.competition.findMany({ where: { enabled: true, assignments: { some: { classId: user?.classId ?? "" } } }, orderBy: { createdAt: "desc" } });
  return <AppShell><Card><h1 className="text-2xl font-bold">AI 比赛</h1><div className="mt-4 grid gap-3">{competitions.map((competition) => <Link key={competition.id} href={`/competitions/${competition.id}`} className="rounded-xl border p-4 hover:bg-slate-50"><div className="font-semibold">{competition.title}</div><p className="mt-1 line-clamp-2 text-sm text-slate-600">{competition.description}</p><p className="mt-2 text-xs text-slate-500">{formatMetricName(competition.metric)} · {competition.runtimeLimitMs}ms</p></Link>)}{!competitions.length && <p className="text-sm text-slate-500">暂无可参加比赛。</p>}</div></Card></AppShell>;
}

export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell";
import { Card, StatusBadge } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { buildLeaderboard } from "@/lib/leaderboard";
import { formatMetricName, formatMetricValue } from "@/lib/judge";
import SubmitForm from "./submit-form";

export default async function CompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const competition = await prisma.competition.findFirst({ where: { id, enabled: true, assignments: { some: { classId: user?.classId ?? "" } } }, include: { submissions: { include: { user: true }, orderBy: { createdAt: "desc" } } } });
  if (!competition) notFound();
  const leaderboard = buildLeaderboard(competition.submissions);
  const mySubmissions = competition.submissions.filter((submission) => submission.userId === user?.id).slice(0, 10);
  return <AppShell><div className="grid gap-6 lg:grid-cols-[1fr_520px]"><section className="grid gap-6"><Card><h1 className="text-3xl font-bold">{competition.title}</h1><p className="mt-2 text-sm text-slate-500">指标 {formatMetricName(competition.metric)} · 运行限制 {competition.runtimeLimitMs}ms</p><pre className="mt-6 whitespace-pre-wrap rounded-xl bg-slate-100 p-4 text-sm">{competition.description}</pre><h2 className="mt-6 text-xl font-bold">提交约定</h2><div className="mt-2 rounded-xl bg-slate-950 p-4 text-sm text-white"><p>平台运行：python3 main.py --data-dir &lt;hiddenTestDir&gt; --output &lt;predictionCsvPath&gt;</p><p className="mt-2">输出 CSV：id,prediction</p></div></Card><Card><h2 className="text-xl font-bold">排行榜</h2><table className="mt-3"><thead><tr><th>排名</th><th>用户</th><th>{formatMetricName(competition.metric)}</th><th>提交次数</th><th>时间</th></tr></thead><tbody>{leaderboard.map((entry) => <tr key={entry.id}><td>#{entry.rank}</td><td>{entry.user.nickname}</td><td>{formatMetricValue(entry.metricValue)}</td><td>{entry.submissionCount}</td><td>{entry.createdAt.toLocaleString()}</td></tr>)}</tbody></table>{!leaderboard.length && <p className="mt-3 text-sm text-slate-500">暂无上榜提交。</p>}</Card><Card><h2 className="text-xl font-bold">我的提交</h2><table className="mt-3"><tbody>{mySubmissions.map((submission) => <tr key={submission.id}><td><a className="font-medium" href={`/submissions/${submission.id}`}>{submission.createdAt.toLocaleString()}</a></td><td><StatusBadge status={submission.status} /></td><td>{formatMetricValue(submission.metricValue)}</td></tr>)}</tbody></table>{!mySubmissions.length && <p className="mt-3 text-sm text-slate-500">还没有提交。</p>}</Card></section><Card><h2 className="text-xl font-bold">提交代码</h2><SubmitForm competitionId={competition.id} template={competition.codeTemplate} /></Card></div></AppShell>;
}

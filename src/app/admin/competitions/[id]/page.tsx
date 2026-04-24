export const dynamic = "force-dynamic";
import { AdminNav, AppShell } from "@/components/shell";
import { Card, StatusBadge } from "@/components/ui";
import { AssignmentForm } from "@/components/admin-forms";
import { buildLeaderboard } from "@/lib/leaderboard";
import { formatMetricName, formatMetricValue } from "@/lib/judge";
import { prisma } from "@/lib/prisma";
import CompetitionEditor from "./competition-editor";

export default async function CompetitionEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const [competition, classes] = await Promise.all([isNew ? null : prisma.competition.findUnique({ where: { id }, include: { assignments: true, submissions: { include: { user: true }, orderBy: { createdAt: "desc" } } } }), prisma.class.findMany()]);
  const leaderboard = competition ? buildLeaderboard(competition.submissions) : [];
  return <AppShell admin><AdminNav /><div className="grid gap-6 lg:grid-cols-[1fr_360px]"><section className="grid gap-6"><Card><h1 className="text-xl font-bold">{isNew ? "新建比赛" : "编辑比赛"}</h1><CompetitionEditor competition={competition} /></Card>{competition && <Card><h2 className="text-xl font-bold">排行榜</h2><table className="mt-3"><thead><tr><th>排名</th><th>用户</th><th>{formatMetricName(competition.metric)}</th><th>提交次数</th></tr></thead><tbody>{leaderboard.map((entry) => <tr key={entry.id}><td>#{entry.rank}</td><td>{entry.user.nickname}</td><td>{formatMetricValue(entry.metricValue)}</td><td>{entry.submissionCount}</td></tr>)}</tbody></table></Card>}{competition && <Card><h2 className="text-xl font-bold">近期提交</h2><table className="mt-3"><tbody>{competition.submissions.slice(0, 20).map((submission) => <tr key={submission.id}><td>{submission.user.nickname}</td><td><StatusBadge status={submission.status} /></td><td>{formatMetricValue(submission.metricValue)}</td><td>{submission.createdAt.toLocaleString()}</td></tr>)}</tbody></table></Card>}</section>{!isNew && competition && <Card><h2 className="text-xl font-bold">班级分配</h2><div className="mt-4"><AssignmentForm competitionId={competition.id} classes={classes} assigned={competition.assignments.map((assignment) => assignment.classId)} /></div></Card>}</div></AppShell>;
}

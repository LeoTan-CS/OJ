export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell";
import { Card, StatusBadge } from "@/components/ui";
import { getCurrentUser, getRoleHomePath } from "@/lib/auth";
import { anonymizeModelLeaderboardData } from "@/lib/model-leaderboard";
import { loadModelLeaderboardData } from "@/lib/model-leaderboard-server";
import { getSyncedModelUploadIds } from "@/lib/model-sync";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleString("zh-CN", { hour12: false }) : "-";
}

function formatDuration(durationMs: number | null | undefined) {
  return durationMs == null ? "-" : `${Math.round(durationMs)}ms`;
}

function formatScore(value: number) {
  return value.toFixed(2).replace(/\.00$/, "");
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user && user.role !== "USER") redirect(getRoleHomePath(user.role));
  const currentUsername = user.username;

  const uploadIds = await getSyncedModelUploadIds();
  const [announcements, leaderboard, model] = await Promise.all([
    prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    loadModelLeaderboardData(),
    prisma.modelArtifact.findFirst({
      where: { id: { in: uploadIds }, userId: user.id },
      include: { group: true, results: { include: { batch: true }, orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const latestResult = model?.results[0];
  const anonymousLeaderboard = anonymizeModelLeaderboardData(leaderboard, currentUsername);
  const topRankings = anonymousLeaderboard.totals.slice(0, 5);
  const myRankingIndex = leaderboard.totals.findIndex((entry) => entry.username === currentUsername || entry.modelId === currentUsername);
  const myRanking = myRankingIndex >= 0 ? leaderboard.totals[myRankingIndex] : null;

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid gap-6">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-sm font-semibold text-slate-500">用户仪表盘</p>
                <h1 className="mt-2 text-3xl font-bold text-slate-950">模型总览</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  这里集中查看当前模型状态、最近一次平台测试结果，以及全站模型排行榜的最新表现。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" href="/models">管理模型</Link>
                <Link className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700" href="/leaderboard">查看完整排行榜</Link>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-semibold text-slate-500">当前模型</div>
                <div className="mt-2 text-lg font-bold text-slate-950">{model?.name ?? "未上传"}</div>
                <div className="mt-3 text-sm text-slate-500">
                  {model ? model.originalFilename : "前往“我的模型”上传第一个模型压缩包。"}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-semibold text-slate-500">最近测试结果</div>
                <div className="mt-2">
                  <StatusBadge status={latestResult?.status ?? "未测试"} />
                </div>
                <div className="mt-3 text-sm text-slate-500">
                  {latestResult ? `${latestResult.batch.kind === "RANKING" ? "排名批次" : "测试批次"} · ${formatDuration(latestResult.durationMs)}` : "还没有平台测试记录。"}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-sm font-semibold text-slate-500">榜单位置</div>
                <div className="mt-2 text-lg font-bold text-slate-950">{myRanking ? `#${myRankingIndex + 1}` : "未上榜"}</div>
                <div className="mt-3 text-sm text-slate-500">
                  {myRanking ? `累计总分 ${formatScore(myRanking.totalScore)}` : "完成模型排名后会出现在总榜中。"}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">排行榜预览</h2>
                <p className="mt-1 text-sm text-slate-500">展示当前模型总榜前 5 名，完整明细可进入排行榜页面查看。</p>
              </div>
              <Link className="text-sm font-semibold text-slate-700" href="/leaderboard">查看全部</Link>
            </div>
            <table className="mt-4">
              <thead>
                <tr>
                  <th>排名</th>
                  <th>模型</th>
                  <th>用户</th>
                  <th>最终得分</th>
                </tr>
              </thead>
              <tbody>
                {topRankings.map((entry, index) => (
                  <tr key={entry.modelId} className={entry.isCurrentUser ? "bg-emerald-50 font-semibold text-slate-950" : undefined}>
                    <td className="font-bold text-slate-900">#{index + 1}</td>
                    <td className="font-semibold">{entry.modelName}</td>
                    <td>{entry.username}</td>
                    <td>{formatScore(entry.totalScore)}</td>
                  </tr>
                ))}
                {!topRankings.length && <tr><td colSpan={4} className="text-sm text-slate-500">还没有完成的模型排名批次。</td></tr>}
              </tbody>
            </table>
          </Card>
        </section>

        <aside className="grid gap-6">
          <Card>
            <h2 className="text-xl font-bold">我的模型状态</h2>
            <div className="mt-4 grid gap-4 text-sm text-slate-600">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">上传时间</div>
                <div className="mt-1 font-medium text-slate-900">{formatDate(model?.createdAt)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">启用状态</div>
                <div className="mt-1 font-medium text-slate-900">{model ? (model.enabled ? "已启用" : "已禁用") : "-"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">最近批次</div>
                <div className="mt-1 font-medium text-slate-900">{latestResult?.batch.id ?? "-"}</div>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-xl font-bold">全站公告</h2>
            <div className="mt-4 grid gap-4">
              {announcements.map((announcement) => (
                <article key={announcement.id} className="border-b pb-4 last:border-0 last:pb-0">
                  <h3 className="font-semibold text-slate-950">{announcement.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{announcement.body}</p>
                  <p className="mt-3 text-xs text-slate-400">{formatDate(announcement.createdAt)}</p>
                </article>
              ))}
              {!announcements.length && <p className="text-sm text-slate-500">还没有公告。</p>}
            </div>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}

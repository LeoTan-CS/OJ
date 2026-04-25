export const dynamic = "force-dynamic";
import { AdminNav, AppShell } from "@/components/shell";
import { ModelLeaderboardView } from "@/components/model-leaderboard-view";
import { Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { loadModelLeaderboardData } from "@/lib/model-leaderboard-server";

export default async function AdminModelLeaderboardPage() {
  await requireAdmin();
  const leaderboard = await loadModelLeaderboardData();

  return (
    <AppShell admin>
      <AdminNav />
      <div className="grid gap-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card><div className="text-sm text-slate-500">已完成排名批次</div><div className="mt-2 text-3xl font-bold">{leaderboard.batches.length}</div></Card>
          <Card><div className="text-sm text-slate-500">上榜模型数</div><div className="mt-2 text-3xl font-bold">{leaderboard.totals.length}</div></Card>
          <Card><div className="text-sm text-slate-500">最新批次</div><div className="mt-2 break-all text-sm font-medium">{leaderboard.batches[0]?.batchId ?? "暂无"}</div></Card>
        </div>
        <ModelLeaderboardView batches={leaderboard.batches} totals={leaderboard.totals} />
      </div>
    </AppShell>
  );
}

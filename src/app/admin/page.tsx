export const dynamic = "force-dynamic";

import { AdminNav, AppShell } from "@/components/shell";
import { Card, StatusBadge } from "@/components/ui";
import { getSyncedModelUploadIds } from "@/lib/model-sync";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date | null) {
  return value ? value.toLocaleString("zh-CN", { hour12: false }) : "-";
}

export default async function AdminPage() {
  const uploadIds = await getSyncedModelUploadIds();
  const [users, models, enabledModels, batches] = await Promise.all([
    prisma.user.count(),
    prisma.modelArtifact.count({ where: { id: { in: uploadIds } } }),
    prisma.modelArtifact.count({ where: { id: { in: uploadIds }, enabled: true } }),
    prisma.modelTestBatch.findMany({
      include: {
        createdBy: true,
        results: {
          select: { status: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const stats = [
    { label: "用户数", value: users },
    { label: "模型数", value: models },
    { label: "启用模型", value: enabledModels },
    { label: "批次数", value: batches.length ? `${batches.length}+` : "0" },
  ];

  return (
    <AppShell admin>
      <AdminNav />
      <div className="grid gap-6">
        <div className="grid gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <div className="text-sm text-slate-500">{stat.label}</div>
              <div className="mt-2 text-3xl font-bold text-slate-950">{stat.value}</div>
            </Card>
          ))}
        </div>

        <Card>
          <h1 className="text-xl font-bold">最近批次活动</h1>
          <p className="mt-1 text-sm text-slate-500">集中查看模型测试与模型排名的最新进展、创建人和结果数量。</p>
          <table className="mt-4">
            <thead>
              <tr>
                <th>批次</th>
                <th>类型</th>
                <th>创建人</th>
                <th>状态</th>
                <th>模型结果</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const completed = batch.results.filter((result) => result.status === "SCORED").length;
                return (
                  <tr key={batch.id}>
                    <td className="font-semibold text-slate-950">{batch.id}</td>
                    <td>{batch.kind === "RANKING" ? "模型排名" : "模型测试"}</td>
                    <td>{batch.createdBy.username}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={batch.status} />
                        {batch.kind === "RANKING" && <StatusBadge status={batch.judgeStatus} />}
                      </div>
                    </td>
                    <td>{completed}/{batch.results.length}</td>
                    <td>{formatDate(batch.createdAt)}</td>
                  </tr>
                );
              })}
              {!batches.length && <tr><td colSpan={6} className="text-sm text-slate-500">还没有模型测试或模型排名批次。</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}

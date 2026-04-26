export const dynamic = "force-dynamic";
import { AdminNav, AppShell } from "@/components/shell";
import { ModelEnabledToggle } from "@/components/admin-forms";
import { ModelConnectivityTestPanel } from "@/components/model-connectivity-test-panel";
import { Card, ModelIdentity } from "@/components/ui";
import { getSyncedModelUploadIds } from "@/lib/model-sync";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date) {
  return value.toLocaleString("zh-CN", { hour12: false });
}

export default async function AdminModelTestsPage() {
  const uploadIds = await getSyncedModelUploadIds();
  const models = await prisma.modelArtifact.findMany({
    where: { id: { in: uploadIds } },
    include: { user: true, group: true },
    orderBy: { createdAt: "desc" },
  });
  const enabledCount = models.filter((model) => model.enabled).length;
  return (
    <AppShell admin>
      <AdminNav />
      <div className="grid gap-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card><div className="text-sm text-slate-500">模型总数</div><div className="mt-2 text-3xl font-bold">{models.length}</div></Card>
          <Card><div className="text-sm text-slate-500">启用模型</div><div className="mt-2 text-3xl font-bold">{enabledCount}</div></Card>
        </div>
        <Card>
          <ModelConnectivityTestPanel
            models={models.map((model) => ({
              modelId: model.id,
              modelName: model.name,
              username: model.user.username,
              groupName: model.group?.name ?? null,
              enabled: model.enabled,
            }))}
          />
        </Card>
        <Card>
          <h2 className="text-xl font-bold">模型列表</h2>
          <table className="mt-3">
            <thead>
              <tr>
                <th>模型</th>
                <th>启用状态</th>
                <th>上传时间</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.id}>
                  <td>
                    <ModelIdentity modelName={model.name} username={model.user.username} groupName={model.group?.name ?? null} />
                    <div className="mt-1 break-all text-xs text-slate-400">文件 {model.originalFilename}</div>
                  </td>
                  <td><ModelEnabledToggle modelId={model.id} enabled={model.enabled} /></td>
                  <td>{formatDate(model.createdAt)}</td>
                </tr>
              ))}
              {!models.length && <tr><td colSpan={3} className="text-sm text-slate-500">暂无模型。</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}

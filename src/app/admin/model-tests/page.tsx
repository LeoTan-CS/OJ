export const dynamic = "force-dynamic";
import { AdminNav, AppShell } from "@/components/shell";
import { DeleteButton, ModelEnabledToggle, ModelTestButton } from "@/components/admin-forms";
import { Card, StatusBadge } from "@/components/ui";
import { getSyncedModelUploadIds } from "@/lib/model-sync";
import { modelQuestionsPath } from "@/lib/model-upload";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date | null) {
  return value ? value.toLocaleString("zh-CN", { hour12: false }) : "-";
}

export default async function AdminModelTestsPage() {
  const uploadIds = await getSyncedModelUploadIds();
  const [models, batches] = await Promise.all([
    prisma.modelArtifact.findMany({ where: { id: { in: uploadIds } }, include: { user: true, group: true, results: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" } }),
    prisma.modelTestBatch.findMany({ include: { createdBy: true, results: { where: { modelId: { in: uploadIds } }, include: { model: { include: { user: true, group: true } } }, orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const enabledCount = models.filter((model) => model.enabled).length;
  return <AppShell admin><AdminNav /><div className="grid gap-6"><div className="grid gap-4 md:grid-cols-3"><Card><div className="text-sm text-slate-500">模型总数</div><div className="mt-2 text-3xl font-bold">{models.length}</div></Card><Card><div className="text-sm text-slate-500">启用模型</div><div className="mt-2 text-3xl font-bold">{enabledCount}</div></Card><Card><div className="text-sm text-slate-500">测试集</div><div className="mt-2 break-all text-sm font-medium">{modelQuestionsPath}</div></Card></div><Card><div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-xl font-bold">模型测试</h1><p className="mt-1 text-sm text-slate-500">点击后会为所有启用小组模型创建一轮异步测试任务。</p></div><ModelTestButton /></div></Card><Card><h2 className="text-xl font-bold">模型列表</h2><table className="mt-3"><tbody>{models.map((model) => { const latest = model.results[0]; return <tr key={model.id}><td><div className="font-semibold">{model.name}</div><div className="text-xs text-slate-500">小组 {model.group?.name ?? model.name} · 上传人 {model.user.username} · {model.originalFilename}</div></td><td><ModelEnabledToggle modelId={model.id} enabled={model.enabled} /></td><td>{latest ? <StatusBadge status={latest.status} /> : "未测试"}</td><td>{formatDate(model.createdAt)}</td></tr>; })}{!models.length && <tr><td className="text-sm text-slate-500">暂无模型。</td></tr>}</tbody></table></Card><Card><h2 className="text-xl font-bold">测试批次</h2><div className="mt-4 grid gap-6">{batches.map((batch) => <section key={batch.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-semibold">批次 {batch.id}</div><div className="text-xs text-slate-500">创建人 {batch.createdBy.username} · {formatDate(batch.createdAt)}</div></div><div className="flex items-center gap-3"><StatusBadge status={batch.status} /><DeleteButton endpoint={`/api/admin/model-tests/${batch.id}`} /></div></div><table className="mt-3"><tbody>{batch.results.map((result) => <tr key={result.id}><td><div className="font-medium">{result.model.name}</div><div className="text-xs text-slate-500">小组 {result.model.group?.name ?? result.model.name} · 上传人 {result.model.user.username}</div></td><td><StatusBadge status={result.status} /></td><td>{result.durationMs ? `${result.durationMs}ms` : "-"}</td><td className="max-w-md"><div className="truncate text-xs text-slate-500">{result.outputPath ?? result.error ?? "-"}</div>{result.outputPreview && <details className="mt-1 text-xs"><summary className="cursor-pointer text-slate-600">预览</summary><pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-50 p-2">{result.outputPreview}</pre></details>}{result.error && <div className="mt-1 text-xs text-red-600">{result.error}</div>}</td></tr>)}</tbody></table></section>)}{!batches.length && <p className="text-sm text-slate-500">还没有测试批次。</p>}</div></Card></div></AppShell>;
}

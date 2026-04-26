export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell";
import { ModelUploadForm, UserModelTestButton } from "@/components/admin-forms";
import { Card, StatusBadge } from "@/components/ui";
import { getCurrentUser, getRoleHomePath } from "@/lib/auth";
import { getSyncedModelUploadIds } from "@/lib/model-sync";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date) {
  return value.toLocaleString("zh-CN", { hour12: false });
}

export default async function ModelsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "USER") redirect(getRoleHomePath(user.role));
  const uploadIds = await getSyncedModelUploadIds();
  const [model, uploadRecords] = await Promise.all([
    prisma.modelArtifact.findFirst({
      where: { id: { in: uploadIds }, userId: user.id },
      include: { group: true, results: { include: { batch: true }, orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.modelUploadRecord.findMany({
      where: { userId: user.id },
      include: { user: true },
      orderBy: { uploadedAt: "desc" },
    }),
  ]);
  const latest = model?.results[0];

  return <AppShell><div className="grid gap-6"><section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-6"><div><p className="text-sm font-semibold text-slate-500">我的模型</p><h1 className="mt-2 text-3xl font-bold text-slate-950">{model ? model.name : "还没有上传模型"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">每个用户保留一个当前模型。重复上传新的 .zip 文件会覆盖自己的旧模型，目录名固定为当前用户名。</p></div>{model && <div className="flex flex-wrap items-center gap-2"><StatusBadge status={latest?.status ?? "未测试"} /><span className={model.enabled ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700" : "rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500"}>{model.enabled ? "已启用" : "已禁用"}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{model.group?.name ?? "未分组"}</span></div>}</div>{model ? <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="rounded-2xl border border-slate-100 bg-slate-50 p-6"><div className="grid gap-4 sm:grid-cols-3"><div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">文件名</div><div className="mt-1 break-all text-sm font-semibold text-slate-800">{model.originalFilename}</div></div><div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">上传时间</div><div className="mt-1 text-sm font-semibold text-slate-800">{formatDate(model.createdAt)}</div></div><div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">最近耗时</div><div className="mt-1 text-sm font-semibold text-slate-800">{latest?.durationMs ? `${latest.durationMs}ms` : "暂无"}</div></div></div><div className="mt-6 rounded-2xl bg-white p-5"><div className="text-sm font-bold text-slate-900">快速测试</div><p className="mt-1 text-sm text-slate-500">使用固定问题“简单介绍一下自己”测试模型是否可用，最长运行 5 分钟。</p><div className="mt-4"><UserModelTestButton /></div></div></div><Card className="h-fit"><h2 className="text-lg font-bold">替换模型</h2><p className="mt-2 text-sm leading-6 text-slate-500">重新上传会覆盖当前模型文件和测试状态。</p><div className="mt-5"><ModelUploadForm initialName={model.name} /></div></Card></div> : <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]"><div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">📦</div><h2 className="mt-4 text-xl font-bold text-slate-950">上传自己的第一个模型</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">压缩包需要包含 main.py。上传后可以立即用示例问题测试模型是否能正常启动。</p></div><Card><h2 className="text-lg font-bold">上传模型</h2><p className="mt-2 text-sm leading-6 text-slate-500">每个用户仅保留一个当前模型，后续上传会自动覆盖。</p><div className="mt-5"><ModelUploadForm /></div></Card></div>}</section><Card><h2 className="text-xl font-bold">上传记录</h2><p className="mt-1 text-sm text-slate-500">展示当前用户全部成功上传记录。</p><table className="mt-4"><thead><tr><th>上传时间</th><th>上传用户</th><th>文件名</th></tr></thead><tbody>{uploadRecords.map((record) => <tr key={record.id}><td>{formatDate(record.uploadedAt)}</td><td className="font-semibold text-slate-950">{record.user.username}</td><td className="break-all">{record.originalFilename}</td></tr>)}{!uploadRecords.length && <tr><td colSpan={3} className="text-sm text-slate-500">还没有上传记录。</td></tr>}</tbody></table></Card></div></AppShell>;
}

export const dynamic = "force-dynamic";

import Link from "next/link";
import { AdminNav, AppShell } from "@/components/shell";
import { Card } from "@/components/ui";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date) {
  return value.toLocaleString("zh-CN", { hour12: false });
}

function asString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminModelUploadsPage({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string | string[] }>;
}) {
  const params = await searchParams;
  const selectedGroupId = asString(params.groupId) ?? "";
  const groups = await prisma.group.findMany({ orderBy: { name: "asc" } });
  const validGroupId = groups.some((group) => group.id === selectedGroupId) ? selectedGroupId : "";
  const records = await prisma.modelUploadRecord.findMany({
    where: validGroupId ? { groupId: validGroupId } : {},
    include: { group: true, user: true },
    orderBy: { uploadedAt: "desc" },
  });

  return (
    <AppShell admin>
      <AdminNav />
      <div className="grid gap-6">
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold">模型上传记录</h1>
              <p className="mt-1 text-sm text-slate-500">汇总全部成功上传记录，可按组别标记筛选。</p>
            </div>
            <form className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                <span>组别标记</span>
                <select name="groupId" defaultValue={validGroupId}>
                  <option value="">全部组别</option>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">筛选</button>
              {validGroupId && <Link className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700" href="/admin/model-uploads">重置</Link>}
            </form>
          </div>
        </Card>

        <Card>
          <table>
            <thead>
              <tr>
                <th>组别标记</th>
                <th>上传用户</th>
                <th>文件名</th>
                <th>上传时间</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td className="font-semibold text-slate-950">{record.group?.name ?? "未分组"}</td>
                  <td>{record.user.username}</td>
                  <td className="break-all">{record.originalFilename}</td>
                  <td>{formatDate(record.uploadedAt)}</td>
                </tr>
              ))}
              {!records.length && <tr><td colSpan={4} className="text-sm text-slate-500">暂无上传记录。</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}

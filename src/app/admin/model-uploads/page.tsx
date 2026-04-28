export const dynamic = "force-dynamic";

import { AdminNav, AppShell } from "@/components/shell";
import { Card, ModelIdentity } from "@/components/ui";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date) {
  return value.toLocaleString("zh-CN", { hour12: false });
}

export default async function AdminModelUploadsPage() {
  const records = await prisma.modelUploadRecord.findMany({
    include: { model: true, user: true },
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
              <p className="mt-1 text-sm text-slate-500">汇总全部成功上传记录。</p>
            </div>
          </div>
        </Card>

        <Card>
          <table>
            <thead>
              <tr>
                <th>模型</th>
                <th>文件名</th>
                <th>上传时间</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td><ModelIdentity modelName={record.model.name} username={record.user.username} /></td>
                  <td className="break-all">{record.originalFilename}</td>
                  <td>{formatDate(record.uploadedAt)}</td>
                </tr>
              ))}
              {!records.length && <tr><td colSpan={3} className="text-sm text-slate-500">暂无上传记录。</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}

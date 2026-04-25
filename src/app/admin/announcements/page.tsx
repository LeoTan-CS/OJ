export const dynamic = "force-dynamic";

import { AdminNav, AppShell } from "@/components/shell";
import { DeleteButton, JsonForm } from "@/components/admin-forms";
import { Card } from "@/components/ui";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date) {
  return value.toLocaleString("zh-CN", { hour12: false });
}

export default async function AnnouncementsPage() {
  const items = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <AppShell admin>
      <AdminNav />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card>
          <h1 className="text-xl font-bold">发布全站公告</h1>
          <div className="mt-4">
            <JsonForm endpoint="/api/admin/announcements" fields={[{ name: "title", label: "标题" }, { name: "body", label: "正文", textarea: true }]} />
          </div>
        </Card>

        <Card>
          <h1 className="text-xl font-bold">公告列表</h1>
          <table className="mt-4">
            <thead>
              <tr>
                <th>公告</th>
                <th>发布时间</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((announcement) => (
                <tr key={announcement.id}>
                  <td>
                    <div className="font-semibold text-slate-950">{announcement.title}</div>
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-slate-500">{announcement.body}</p>
                  </td>
                  <td>{formatDate(announcement.createdAt)}</td>
                  <td><DeleteButton endpoint={`/api/admin/announcements/${announcement.id}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}

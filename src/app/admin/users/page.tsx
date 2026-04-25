export const dynamic = "force-dynamic";

import { AdminNav, AppShell } from "@/components/shell";
import { DeleteButton, JsonForm, UserImportForm } from "@/components/admin-forms";
import { Card } from "@/components/ui";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date) {
  return value.toLocaleString("zh-CN", { hour12: false });
}

export default async function UsersPage() {
  const [users, groups] = await Promise.all([
    prisma.user.findMany({ include: { group: true }, orderBy: { createdAt: "desc" } }),
    prisma.group.findMany({ include: { _count: { select: { users: true, models: true } } }, orderBy: { name: "asc" } }),
  ]);
  const groupOptions = [
    { label: "不分配", value: "" },
    ...groups.map((group) => ({ label: group.name, value: group.id })),
  ];

  return (
    <AppShell admin>
      <AdminNav />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="grid gap-6">
          <Card>
            <h1 className="text-xl font-bold">新建用户</h1>
            <div className="mt-4">
              <JsonForm
                endpoint="/api/admin/users"
                fields={[
                  { name: "username", label: "用户名" },
                  { name: "password", label: "初始密码", type: "password" },
                  {
                    name: "role",
                    label: "角色",
                    options: [
                      { label: "USER", value: "USER" },
                      { label: "ADMIN", value: "ADMIN" },
                      { label: "SUPER_ADMIN", value: "SUPER_ADMIN" },
                    ],
                  },
                  { name: "groupId", label: "小组", options: groupOptions },
                ]}
              />
            </div>
          </Card>

          <Card>
            <h1 className="text-xl font-bold">新建小组</h1>
            <div className="mt-4">
              <JsonForm
                endpoint="/api/admin/groups"
                fields={[
                  { name: "name", label: "小组名" },
                ]}
                submitLabel="新建小组"
              />
            </div>
            <div className="mt-5 grid gap-2 text-sm text-slate-600">
              {groups.map((group) => (
                <div key={group.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span className="font-semibold text-slate-900">{group.name}</span>
                  <span>{group._count.users} 用户 · {group._count.models} 模型</span>
                </div>
              ))}
              {!groups.length && <p className="text-sm text-slate-500">暂无小组。</p>}
            </div>
          </Card>

          <Card>
            <h1 className="text-xl font-bold">Excel 批量导入</h1>
            <div className="mt-4">
              <UserImportForm />
            </div>
          </Card>
        </div>

        <Card>
          <h1 className="text-xl font-bold">用户列表</h1>
          <table className="mt-4">
            <thead>
              <tr>
                <th>用户名</th>
                <th>角色</th>
                <th>小组</th>
                <th>创建时间</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="font-semibold text-slate-950">{user.username}</td>
                  <td>{user.role}</td>
                  <td>{user.group?.name ?? "-"}</td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td><DeleteButton endpoint={`/api/admin/users/${user.id}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}

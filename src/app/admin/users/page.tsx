export const dynamic = "force-dynamic";

import { AdminNav, AppShell } from "@/components/shell";
import { JsonForm, UserImportForm } from "@/components/admin-forms";
import { AdminUserTable, type AdminUserTableUser } from "@/components/admin-user-table";
import { Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date) {
  return value.toLocaleString("zh-CN", { hour12: false });
}

function toTableRole(role: string): AdminUserTableUser["role"] {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return role;
  return "USER";
}

export default async function UsersPage() {
  const actor = await requireAdmin();
  const actorRole = actor.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN";
  const [users, groups] = await Promise.all([
    prisma.user.findMany({ include: { group: true }, orderBy: { createdAt: "desc" } }),
    prisma.group.findMany({ include: { _count: { select: { users: true, models: true } } }, orderBy: { name: "asc" } }),
  ]);
  const roleOptions = actorRole === "SUPER_ADMIN"
    ? [
        { label: "USER", value: "USER" },
        { label: "ADMIN", value: "ADMIN" },
        { label: "SUPER_ADMIN", value: "SUPER_ADMIN" },
      ]
    : [{ label: "USER", value: "USER" }];
  const groupOptions = [
    { label: "不分配", value: "" },
    ...groups.map((group) => ({ label: group.name, value: group.id })),
  ];
  const tableUsers: AdminUserTableUser[] = users.map((user) => ({
    id: user.id,
    username: user.username,
    role: toTableRole(user.role),
    groupId: user.groupId,
    groupName: user.group?.name ?? null,
    createdAtLabel: formatDate(user.createdAt),
  }));
  const tableKey = tableUsers.map((user) => `${user.id}:${user.username}:${user.role}:${user.groupId ?? ""}`).join("|");

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
                    options: roleOptions,
                  },
                  { name: "groupId", label: "组别标记", options: groupOptions },
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
          <AdminUserTable key={tableKey} actorRole={actorRole} groups={groupOptions} users={tableUsers} />
        </Card>
      </div>
    </AppShell>
  );
}

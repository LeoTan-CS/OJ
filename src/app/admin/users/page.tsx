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
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  const roleOptions = actorRole === "SUPER_ADMIN"
    ? [
        { label: "USER", value: "USER" },
        { label: "ADMIN", value: "ADMIN" },
        { label: "SUPER_ADMIN", value: "SUPER_ADMIN" },
      ]
    : [{ label: "USER", value: "USER" }];
  const tableUsers: AdminUserTableUser[] = users.map((user) => ({
    id: user.id,
    username: user.username,
    role: toTableRole(user.role),
    createdAtLabel: formatDate(user.createdAt),
  }));
  const tableKey = tableUsers.map((user) => `${user.id}:${user.username}:${user.role}`).join("|");

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
                  { name: "username", label: "账号" },
                  { name: "password", label: "初始密码", type: "password" },
                  {
                    name: "role",
                    label: "角色",
                    options: roleOptions,
                  },
                ]}
              />
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
          <AdminUserTable key={tableKey} actorRole={actorRole} users={tableUsers} />
        </Card>
      </div>
    </AppShell>
  );
}

export const dynamic = "force-dynamic";
import { AppShell } from "@/components/shell";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import PasswordForm from "./password-form";

function roleLabel(role: string) {
  if (role === "SUPER_ADMIN") return "超级管理员";
  if (role === "ADMIN") return "管理员";
  return "普通用户";
}

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <AppShell>
      <div className="grid gap-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-sm font-semibold text-slate-500">个人中心</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-950">{user.username}</h1>
              <p className="mt-2 text-sm text-slate-500">{roleLabel(user.role)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-5 py-4 text-sm text-slate-600">
              <div className="font-semibold text-slate-950">账号 ID</div>
              <div className="mt-1 break-all font-mono text-xs">{user.id}</div>
            </div>
          </div>
        </section>

        <div className="max-w-3xl">
          <Card>
            <h2 className="text-xl font-bold">安全设置</h2>
            <PasswordForm />
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

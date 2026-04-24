import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { NavLink } from "./ui";
import { logoutAction } from "@/lib/actions";

export async function AppShell({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (admin && user.role === "USER") redirect("/dashboard");
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-lg font-bold text-slate-950">Bench OJ</div>
            <div className="text-xs text-slate-500">{user.nickname} · {user.role}</div>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink href="/dashboard">用户首页</NavLink>
            <NavLink href="/account">账号</NavLink>
            {user.role !== "USER" && <NavLink href="/admin">管理后台</NavLink>}
            <form action={logoutAction}><button className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">退出</button></form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

export function AdminNav() {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      <NavLink href="/admin">概览</NavLink>
      <NavLink href="/admin/users">用户</NavLink>
      <NavLink href="/admin/classes">班级</NavLink>
      <NavLink href="/admin/problems">题目</NavLink>
      <NavLink href="/admin/announcements">公告</NavLink>
      <NavLink href="/admin/submissions">提交</NavLink>
    </div>
  );
}

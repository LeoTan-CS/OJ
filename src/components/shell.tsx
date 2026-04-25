import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/lib/actions";
import { NavLink } from "./ui";

export async function AppShell({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (admin && user.role === "USER") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-lg font-bold text-slate-950">Bench AI 模型评测平台</div>
            <div className="text-xs text-slate-500">{user.username} · {user.role}{user.groupName ? ` · ${user.groupName}` : ""}</div>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink href={user.role === "USER" ? "/dashboard" : "/admin"}>仪表盘</NavLink>
            <NavLink href="/leaderboard">排行榜</NavLink>
            {user.role === "USER" && <NavLink href="/models">我的模型</NavLink>}
            <NavLink href="/account">个人中心</NavLink>
            <form action={logoutAction}><button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">退出</button></form>
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
      <NavLink href="/admin/model-uploads">上传记录</NavLink>
      <NavLink href="/admin/model-tests">模型测试</NavLink>
      <NavLink href="/admin/model-rankings">模型排名</NavLink>
      <NavLink href="/admin/model-leaderboard">积分排行榜</NavLink>
      <NavLink href="/admin/announcements">公告</NavLink>
    </div>
  );
}

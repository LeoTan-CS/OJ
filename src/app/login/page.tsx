export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getCurrentUser, getRoleHomePath } from "@/lib/auth";
import { Card } from "@/components/ui";
import LoginForm from "./form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(getRoleHomePath(user.role));
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6"><Card className="w-full max-w-md"><h1 className="text-2xl font-bold">Bench AI 模型评测平台登录</h1><p className="mt-2 text-sm text-slate-500">账号由管理员创建。</p><LoginForm /></Card></main>;
}

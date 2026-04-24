"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field } from "@/components/ui";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  async function submit(formData: FormData) {
    setError("");
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: formData.get("username"), password: formData.get("password") }) });
    if (!res.ok) return setError("账号或密码错误");
    const data = await res.json();
    router.replace(data.role === "SUPER_ADMIN" || data.role === "ADMIN" ? "/admin" : "/dashboard");
    router.refresh();
  }
  return <form action={submit} className="mt-6 grid gap-4"><Field label="用户名"><input name="username" required /></Field><Field label="密码"><input name="password" type="password" required /></Field>{error && <p className="text-sm text-red-600">{error}</p>}<Button>登录</Button><p className="text-xs text-slate-500">初始化账号：superadmin / superadmin123，student / student123</p></form>;
}

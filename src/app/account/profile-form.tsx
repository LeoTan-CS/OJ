"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui";

type Status = { type: "success" | "error"; message: string } | null;

export default function ProfileForm({ currentUsername }: { currentUsername: string }) {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setStatus(null);
    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: formData.get("username"),
        currentPassword: formData.get("currentPassword"),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus({ type: "error", message: typeof data.error === "string" ? data.error : "保存失败" });
      setPending(false);
      return;
    }
    if (passwordRef.current) passwordRef.current.value = "";
    setStatus({ type: "success", message: "资料已更新" });
    setPending(false);
    router.refresh();
  }

  return (
    <form action={submit} className="mt-4 grid gap-4">
      <Field label="用户名">
        <input name="username" defaultValue={currentUsername} minLength={2} pattern="[A-Za-z0-9_.-]+" required />
      </Field>
      <Field label="当前密码">
        <input ref={passwordRef} name="currentPassword" type="password" required />
      </Field>
      {status && (
        <p className={status.type === "success" ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-red-600"}>
          {status.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "保存中..." : "保存资料"}
      </button>
    </form>
  );
}

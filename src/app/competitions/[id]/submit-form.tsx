"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SubmitForm({ competitionId, template }: { competitionId: string; template: string }) {
  const router = useRouter();
  const [code, setCode] = useState(template);
  const [error, setError] = useState("");
  async function submit() {
    setError("");
    const res = await fetch(`/api/competitions/${competitionId}/submissions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "提交失败");
    router.push(`/submissions/${data.submissionId}`);
  }
  return <div className="mt-4 grid gap-3"><textarea className="min-h-96 font-mono" value={code} onChange={(event) => setCode(event.target.value)} />{error && <p className="text-sm text-red-600">{error}</p>}<button onClick={submit} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">提交代码</button></div>;
}
